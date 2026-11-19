package ambot.web;

import ambot.core.ScaleMath;

/**
 * Browser build only: the desktop game scales by whole numbers and letterboxes the
 * rest, which leaves wide black bars in a web page's player box. In the browser the
 * frame is scaled by any factor instead, so it fills the box (keeping 16:9).
 */
public final class WebFit {
    private WebFit() {
    }

    public static ScaleMath.Viewport fitDevice(int componentW, int componentH, double scaleX, double scaleY,
            int logicalW, int logicalH) {
        int w = (int) Math.round(componentW * scaleX);
        int h = (int) Math.round(componentH * scaleY);
        double s = Math.min(w / (double) logicalW, h / (double) logicalH);
        if (!(s > 0)) s = 1;
        int width = (int) Math.round(logicalW * s);
        int height = (int) Math.round(logicalH * s);
        return new ScaleMath.Viewport(Math.max(1, (int) s), (w - width) / 2, (h - height) / 2, width, height);
    }
}
