package app.circadium;

import app.circadium.external.googlecalendar.FakeGoogleCalendarClient;
import app.circadium.external.ics.FakeIcsFeedFetcher;
import app.circadium.external.maps.FakePlacesClient;
import app.circadium.external.maps.FakeRoutesClient;
import app.circadium.external.microsoftgraph.FakeMicrosoftGraphClient;
import app.circadium.external.passwords.FakeBreachedPasswords;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Imported by every test context: a throwaway Postgres, plus every outbound call replaced so no
 * test reaches the internet — the breached-password lookup and the Google Places/Routes clients.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		// No init script: the schema comes from the Flyway migrations at context
		// startup, so every test runs against exactly what a fresh deploy builds.
		return new PostgreSQLContainer(DockerImageName.parse("postgres:16"));
	}

	@Bean
	@Primary
	FakeBreachedPasswords fakeBreachedPasswords() {
		return new FakeBreachedPasswords();
	}

	@Bean
	@Primary
	FakePlacesClient fakePlacesClient() {
		return new FakePlacesClient();
	}

	@Bean
	@Primary
	FakeRoutesClient fakeRoutesClient() {
		return new FakeRoutesClient();
	}

	@Bean
	@Primary
	FakeIcsFeedFetcher fakeIcsFeedFetcher() {
		return new FakeIcsFeedFetcher();
	}

	@Bean
	@Primary
	FakeGoogleCalendarClient fakeGoogleCalendarClient() {
		return new FakeGoogleCalendarClient();
	}

	@Bean
	@Primary
	FakeMicrosoftGraphClient fakeMicrosoftGraphClient() {
		return new FakeMicrosoftGraphClient();
	}

}
