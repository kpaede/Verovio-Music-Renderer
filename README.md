# Verovio Music Renderer for Obsidian

![](Verovio-Plugin.gif)

This is a plugin for Obsidian (https://obsidian.md) that uses Verovio – a fast, portable and lightweight open-source library for engraving Music Encoding Initiative (MEI) music scores (and also ABC and MusicXML) into SVG.

The plugin already has the following features:
- rendering MEI, ABC and MusicXML notation dynamically (working) from the Obsidian folder and URLs
- download button for the rendered SVG-FIle (visible by hovering the mouse over the renderd music)
- a settings menu to change the rendering options (working, though not sure if every option is working, espeically the font option)
- Sound playback of the rendered music

And I would love to implement these as well (and would love some help)
-  highlighting of the live playback notes (as stated in the Verovio docs https://book.verovio.org/interactive-notation/playing-midi.html)
- the possibility to just render a selection of bars (as stated here https://book.verovio.org/interactive-notation/content-selection.html)
- the possibility to render not just URLs but also direct code like the ABCJS plugin https://github.com/abcjs-music/obsidian-plugin-abcjs


## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` from the release (look right) to your vault into a folder like this `VaultFolder/.obsidian/plugins/Verovio-Music-Renderer/`.

## If you work with TS-Files from here, read this:
- Audio playback requires changing the Soundfont path in node_modules/lz-midi/lib/midi.js to 	_root2.default.soundfontUrl = 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/'; (or something similar)


## Additionaly used
- [Verovio](https://github.com/rism-digital/verovio)
- [lz-midi](https://github.com/AAlittleWhite/lz-midi)

I have just rudimentary programming skills and use mostly ChatGPT.
