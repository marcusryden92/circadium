package app.circadium.sync;

import java.sql.PreparedStatement;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;
import java.util.function.IntFunction;
import java.util.stream.Collectors;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Set-based writes for the sync: one statement per table and operation, however many rows it carries.
 *
 * <p>Rows travel as one array per column, expanded by {@code unnest} into a derived table {@code v}, rather than as
 * a {@code VALUES} list with a parameter per cell. The parameter count stays fixed (Postgres caps a statement at
 * 65,535), and the statement text is the same for every batch size, so the driver can reuse its plan. Every write is
 * scoped to the caller: updates and deletes match only rows the caller owns, so an id that is missing or belongs to
 * someone else matches nothing instead of failing the sync.
 */
@Component
@RequiredArgsConstructor
class BulkStatements {

    private final JdbcTemplate jdbcTemplate;

    /** The SQL array type a column's values travel in. */
    enum SqlType {
        TEXT("text", String[]::new),
        INT4("int4", Integer[]::new),
        FLOAT8("float8", Double[]::new),
        BOOL("bool", Boolean[]::new);

        private final String elementType;
        private final IntFunction<Object[]> newArray;

        SqlType(String elementType, IntFunction<Object[]> newArray) {
            this.elementType = elementType;
            this.newArray = newArray;
        }
    }

    /**
     * One written column. {@code cast} converts the array element into the column's own type where the array cannot
     * carry it directly (the Postgres enums and {@code jsonb} travel as text).
     */
    record Column<T>(String name, SqlType type, String cast, Function<? super T, ?> value) {

        static <T> Column<T> text(String name, Function<? super T, String> value) {
            return new Column<>(name, SqlType.TEXT, null, value);
        }

        static <T> Column<T> int4(String name, Function<? super T, Integer> value) {
            return new Column<>(name, SqlType.INT4, null, value);
        }

        static <T> Column<T> float8(String name, Function<? super T, Double> value) {
            return new Column<>(name, SqlType.FLOAT8, null, value);
        }

        static <T> Column<T> bool(String name, Function<? super T, Boolean> value) {
            return new Column<>(name, SqlType.BOOL, null, value);
        }

        static <T> Column<T> jsonb(String name, Function<? super T, String> value) {
            return new Column<>(name, SqlType.TEXT, "jsonb", value);
        }

        /** A {@code timestamp(3)} column: the value travels as the ISO text and is cast to the column type. */
        static <T> Column<T> timestamp(String name, Function<? super T, String> value) {
            return new Column<>(name, SqlType.TEXT, "timestamp(3)", value);
        }

        /** A Postgres enum column, written from the Java constant's name (the database label). */
        static <T> Column<T> label(String name, String enumType, Function<? super T, ? extends Enum<?>> value) {
            return new Column<>(name, SqlType.TEXT, '"' + enumType + '"', row -> {
                Enum<?> constant = value.apply(row);
                return constant == null ? null : constant.name();
            });
        }

        private String selected() {
            String column = "v." + quote(name);
            return cast == null ? column : column + "::" + cast;
        }
    }

    /**
     * A reference a row may only make to the caller's own rows: the referenced {@code parentTable} row must belong to
     * the caller, or the reference must be {@code null}. A row failing the check is skipped, as a ghost id is.
     */
    record OwnedReference(String column, String parentTable) {

        private String condition() {
            return "(v." + quote(column) + " IS NULL OR EXISTS (SELECT 1 FROM " + quote(parentTable)
                    + " p WHERE p.\"id\" = v." + quote(column) + " AND p.\"userId\" = ?))";
        }
    }

    /**
     * Inserts {@code rows} with {@code userId} as their owner. {@code onConflict} is appended as written: empty for a
     * plain insert, which fails on a duplicate. {@code updatedAt} is not written: it is DB-owned (column default on
     * insert, trigger on update).
     */
    <T> void insertOwned(String table, List<T> rows, List<Column<T>> columns, String userId,
            List<OwnedReference> references, String onConflict) {
        if (rows.isEmpty()) {
            return;
        }
        List<String> targetColumns = new ArrayList<>(columns.stream().map(c -> quote(c.name())).toList());
        List<String> selected = new ArrayList<>(columns.stream().map(Column::selected).toList());
        List<Object> params = new ArrayList<>();

        targetColumns.add("\"userId\"");
        selected.add("?::text");
        params.add(userId);

        StringBuilder sql = new StringBuilder()
                .append("INSERT INTO ").append(quote(table))
                .append(" (").append(String.join(", ", targetColumns)).append(")")
                .append(" SELECT ").append(String.join(", ", selected))
                .append(" FROM ").append(unnest(rows, columns, params));
        appendReferences(sql, references, userId, params, " WHERE ");
        if (!onConflict.isEmpty()) {
            sql.append(' ').append(onConflict);
        }
        execute(sql.toString(), params);
    }

    /**
     * Inserts rows of a table that has no owner column, keeping only those whose {@code parentColumn} points at a
     * {@code parentTable} row the caller owns.
     */
    <T> void insertThroughParent(String table, List<T> rows, List<Column<T>> columns, String parentColumn,
            String parentTable, String userId, String onConflict) {
        if (rows.isEmpty()) {
            return;
        }
        List<Object> params = new ArrayList<>();
        String sql = "INSERT INTO " + quote(table)
                + " (" + columns.stream().map(c -> quote(c.name())).collect(Collectors.joining(", ")) + ")"
                + " SELECT " + columns.stream().map(Column::selected).collect(Collectors.joining(", "))
                + " FROM " + unnest(rows, columns, params)
                + " WHERE EXISTS (SELECT 1 FROM " + quote(parentTable) + " p WHERE p.\"id\" = v." + quote(parentColumn)
                + " AND p.\"userId\" = ?) " + onConflict;
        params.add(userId);
        execute(sql, params);
    }

    /**
     * Updates the caller's rows matching {@code rows} by id to the given column values. {@code updatedAt} is not
     * written: a {@code BEFORE UPDATE} trigger owns it.
     */
    <T> void updateOwned(String table, List<T> rows, Function<? super T, String> id, List<Column<T>> columns,
            String userId, List<OwnedReference> references) {
        if (rows.isEmpty()) {
            return;
        }
        List<Object> params = new ArrayList<>();
        List<String> assignments = new ArrayList<>(
                columns.stream().map(c -> quote(c.name()) + " = " + c.selected()).toList());

        List<Column<T>> withId = new ArrayList<>();
        withId.add(Column.text("id", id));
        withId.addAll(columns);

        StringBuilder sql = new StringBuilder()
                .append("UPDATE ").append(quote(table)).append(" AS t SET ").append(String.join(", ", assignments))
                .append(" FROM ").append(unnest(rows, withId, params))
                .append(" WHERE t.\"id\" = v.\"id\" AND t.\"userId\" = ?");
        params.add(userId);
        appendReferences(sql, references, userId, params, " AND ");
        execute(sql.toString(), params);
    }

    /** Deletes the caller's rows with these ids. */
    void deleteOwned(String table, List<String> ids, String userId) {
        if (ids.isEmpty()) {
            return;
        }
        execute("DELETE FROM " + quote(table) + " WHERE \"userId\" = ? AND \"id\" = ANY (?::text[])",
                List.of(userId, new SqlArray(SqlType.TEXT, ids.toArray(String[]::new))));
    }

    /** Deletes rows of a table with no owner column whose {@code parentColumn} points at a row the caller owns. */
    void deleteThroughParent(String table, List<String> ids, String parentColumn, String parentTable, String userId) {
        if (ids.isEmpty()) {
            return;
        }
        execute("DELETE FROM " + quote(table) + " t WHERE t.\"id\" = ANY (?::text[]) AND EXISTS (SELECT 1 FROM "
                        + quote(parentTable) + " p WHERE p.\"id\" = t." + quote(parentColumn) + " AND p.\"userId\" = ?)",
                List.of(new SqlArray(SqlType.TEXT, ids.toArray(String[]::new)), userId));
    }

    private static <T> String unnest(List<T> rows, List<Column<T>> columns, List<Object> params) {
        List<String> arrays = new ArrayList<>();
        for (Column<T> column : columns) {
            Object[] values = rows.stream().map(column.value()).toArray(column.type().newArray);
            params.add(new SqlArray(column.type(), values));
            arrays.add("?::" + column.type().elementType + "[]");
        }
        return "unnest(" + String.join(", ", arrays) + ") AS v("
                + columns.stream().map(c -> quote(c.name())).collect(Collectors.joining(", ")) + ")";
    }

    private static void appendReferences(StringBuilder sql, List<OwnedReference> references, String userId,
            List<Object> params, String firstJoiner) {
        String joiner = firstJoiner;
        for (OwnedReference reference : references) {
            sql.append(joiner).append(reference.condition());
            params.add(userId);
            joiner = " AND ";
        }
    }

    private void execute(String sql, List<Object> params) {
        jdbcTemplate.update(connection -> {
            PreparedStatement statement = connection.prepareStatement(sql);
            for (int i = 0; i < params.size(); i++) {
                if (params.get(i) instanceof SqlArray(SqlType type, Object[] values)) {
                    statement.setArray(i + 1, connection.createArrayOf(type.elementType, values));
                } else {
                    statement.setString(i + 1, (String) params.get(i));
                }
            }
            return statement;
        });
    }

    private static String quote(String identifier) {
        return '"' + identifier + '"';
    }

    private record SqlArray(SqlType type, Object[] values) {
    }
}
