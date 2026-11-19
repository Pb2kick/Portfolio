package ambot.web;

import ambot.audio.Audio;
import ambot.audio.Music;
import ambot.audio.Sfx;

/**
 * Browser build only: CheerpJ has no javax.sound mixers, so sound is handed to the
 * host page, which plays the same WAV files with Web Audio. The page implements the
 * native methods below (see the natives passed to cheerpjInit in the portfolio's
 * script.js), which also lets the page's mute/volume controls apply to the game.
 *
 * Volumes keep the game's own 0..10 scale; the page multiplies them by its master volume.
 */
public final class WebAudio implements Audio {
    private int musicVolume = 7, sfxVolume = 8;

    private static native void jsPlaySfx(String path, int level);

    private static native void jsPlayMusic(String path, int level);

    private static native void jsStopMusic();

    private static native void jsMusicVolume(int level);

    @Override
    public void play(Sfx s) {
        try {
            jsPlaySfx(s.path(), sfxVolume);
        } catch (Throwable ignored) {
            // the page has no sound bridge: stay silent rather than crash the game
        }
    }

    @Override
    public void playMusic(Music m) {
        try {
            jsPlayMusic(m.path(), musicVolume);
        } catch (Throwable ignored) {
            // see play()
        }
    }

    @Override
    public void stopMusic() {
        try {
            jsStopMusic();
        } catch (Throwable ignored) {
            // see play()
        }
    }

    @Override
    public void setMusicVolume(int level) {
        musicVolume = Math.max(0, Math.min(10, level));
        try {
            jsMusicVolume(musicVolume);
        } catch (Throwable ignored) {
            // see play()
        }
    }

    @Override
    public void setSfxVolume(int level) {
        sfxVolume = Math.max(0, Math.min(10, level));
    }
}
