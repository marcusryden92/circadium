# syntax=docker/dockerfile:1

# --- Build stage: compile and package with a full JDK ---
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build

# Keep the Maven repo in a BuildKit cache mount so dependencies persist across
# builds without being baked into (and committed as) an image layer.
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
COPY src/ src/
RUN --mount=type=cache,target=/root/.m2 \
    chmod +x mvnw && ./mvnw -B clean package -DskipTests

# --- Runtime stage: run the jar on a slim JRE as a non-root user ---
FROM eclipse-temurin:25-jre AS runtime
WORKDIR /app

# Run non-root as a numeric UID: no /etc/passwd entry needed, portable across base images.
USER 1000:1000

COPY --from=build /build/target/server-*.jar app.jar

EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75.0", "-jar", "app.jar"]
