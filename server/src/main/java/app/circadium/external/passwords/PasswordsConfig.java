package app.circadium.external.passwords;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Slf4j
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(PwnedPasswordsProperties.class)
class PasswordsConfig {

    @Bean
    BreachedPasswords breachedPasswords(PwnedPasswordsProperties properties) {
        if (properties.enabled()) {
            return PwnedPasswordsClient.create(properties);
        }
        log.warn("The breached-password check is off (circadium.passwords.pwned.enabled=false)");
        return password -> false;
    }
}
