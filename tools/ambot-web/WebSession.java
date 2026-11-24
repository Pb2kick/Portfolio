package ambot.web;

/**
 * Browser build only.
 *
 * Quit: "Quit" can't close a browser tab, and System.exit would end the Java runtime
 * for good, so the game could never be played again without a reload. Instead, Quit
 * hands control to the page (which shows its "Play again" cover) and the game thread
 * waits until the visitor clicks it, then carries on from the main menu.
 *
 * First frame: the page keeps its loading cover up until the game has actually painted
 * a frame, so the visitor never sees a black canvas while CheerpJ warms up.
 */
public final class WebSession {
    private static volatile boolean framePainted;

    private WebSession() {
    }

    private static native void jsQuit();

    /** Implemented by the page as an async native: returns when "Play again" is clicked. */
    private static native void jsAwaitReplay();

    private static native void jsFirstFrame();

    /** Returns true when the page handled Quit; false means fall back to the desktop behaviour. */
    public static boolean quit() {
        try {
            jsQuit();
            jsAwaitReplay();
            return true;
        } catch (Throwable t) {
            return false;
        }
    }

    /** Called after every paint of the game screen; tells the page once, after the first real frame. */
    public static void painted() {
        if (framePainted) return;
        framePainted = true;
        try {
            jsFirstFrame();
        } catch (Throwable ignored) {
            // no page bridge: nothing to tell
        }
    }
}
