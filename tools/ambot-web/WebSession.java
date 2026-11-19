package ambot.web;

/**
 * Browser build only: "Quit" can't close a browser tab, and System.exit would end the
 * Java runtime for good, so the game could never be played again without a reload.
 * Instead, Quit hands control to the page (which shows its "Play again" cover) and the
 * game thread waits until the visitor clicks it, then carries on from the main menu.
 */
public final class WebSession {
    private WebSession() {
    }

    private static native void jsQuit();

    /** Implemented by the page as an async native: returns when "Play again" is clicked. */
    private static native void jsAwaitReplay();

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
}
