package app.circadium.external.mail;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(MailProperties.class)
class MailConfig {

    /**
     * Resend when a key is configured. Without one, startup fails unless the logging fallback is allowed
     * (only {@code local}), so a deployment can never silently drop verification and reset mail.
     */
    @Bean
    AccountMailer accountMailer(MailProperties properties, Environment environment) {
        if (properties.deliveryConfigured()) {
            return ResendAccountMailer.create(properties);
        }
        if (!properties.allowLoggingFallback()) {
            throw new IllegalStateException(
                    "RESEND_API_KEY is not set. Account mail must be delivered outside the local profile.");
        }
        return new LoggingAccountMailer(environment.matchesProfiles("local"));
    }
}
