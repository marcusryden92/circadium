package app.circadium.external.ics;

import java.util.HashMap;
import java.util.Map;

/** Canned feed texts per URL; an unknown URL answers like an unreachable feed. */
public class FakeIcsFeedFetcher implements IcsFeedFetcher {

    public final Map<String, String> textByUrl = new HashMap<>();
    public final Map<String, IcsFeedException> failureByUrl = new HashMap<>();

    public void reset() {
        textByUrl.clear();
        failureByUrl.clear();
    }

    @Override
    public String fetch(String url) {
        IcsFeedException failure = failureByUrl.get(url);
        if (failure != null) {
            throw failure;
        }
        String text = textByUrl.get(url);
        if (text == null) {
            throw new IcsFeedException("The feed could not be fetched");
        }
        return text;
    }
}
