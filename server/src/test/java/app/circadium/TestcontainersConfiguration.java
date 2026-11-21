package app.circadium;

import app.circadium.external.passwords.FakeBreachedPasswords;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Imported by every test context: a throwaway Postgres, plus the one outbound call that sits on the sign-up path
 * (the breached-password lookup) replaced so no test reaches the internet.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:16"))
						.withInitScript("db/schema.sql");
	}

	@Bean
	@Primary
	FakeBreachedPasswords fakeBreachedPasswords() {
		return new FakeBreachedPasswords();
	}

}
