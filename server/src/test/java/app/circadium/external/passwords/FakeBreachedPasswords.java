package app.circadium.external.passwords;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/** Keeps tests off the network: only passwords a test adds count as breached. */
public class FakeBreachedPasswords implements BreachedPasswords {

    private final Set<String> breached = ConcurrentHashMap.newKeySet();

    public void add(String password) {
        breached.add(password);
    }

    @Override
    public boolean isBreached(String password) {
        return breached.contains(password);
    }
}
