package app.circadium.web;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Profile("diagnostics")
@RestController
@RequestMapping("/internal/diagnostics")
public class DiagnosticsController {

    @GetMapping("/boom")
    public String boom() {
        throw new IllegalStateException("Deliberate diagnostics failure");
    }

    @PostMapping("/validate")
    public String validate(@Valid @RequestBody Probe probe) {
        return "ok: " + probe.name();
    }

    public record Probe(@NotBlank String name) {}
}