package app.circadium.account;

import app.circadium.account.DataImportService.ImportResult;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.node.ObjectNode;

@RestController
@RequiredArgsConstructor
@Tag(name = "Account data")
public class DataTransferController {

    private final DataExportService dataExportService;
    private final DataImportService dataImportService;

    public record ImportRequest(@NotBlank String mode, @NotNull JsonNode data) {}

    @GetMapping("/account/export")
    @Operation(summary = "Export the account's data",
            description = "GDPR access + portability: one JSON blob of everything the user stores. "
                    + "Credentials (password hashes, OAuth and calendar-connection tokens) are excluded.")
    @ApiResponse(responseCode = "200", description = "The export")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    public ObjectNode export(@AuthenticationPrincipal Jwt jwt) {
        return dataExportService.export(jwt.getSubject());
    }

    @PostMapping("/account/import")
    @Operation(summary = "Import a Circadium export",
            description = "mode 'replace' wipes the account and restores the file with ids preserved; "
                    + "'add' imports everything as new rows with every id remapped. One transaction — "
                    + "a failure changes nothing. Bumps dataVersion, so other sessions re-bootstrap.")
    @ApiResponse(responseCode = "200", description = "Rows imported")
    @ApiResponse(responseCode = "400", description = "Not a Circadium export "
            + "(codes invalid_payload / unrecognized_format / invalid_mode)")
    @ApiResponse(responseCode = "401", description = "No valid access token")
    @ApiResponse(responseCode = "422", description = "The transaction failed and was rolled back "
            + "(code import_failed)")
    public ImportResult importData(@AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ImportRequest request) {
        return dataImportService.importData(jwt.getSubject(), request.mode(), request.data());
    }
}
