# Verovio Music Renderer for Obsidian

[![](Verovio-Plugin.mp4)]

This is a plugin for Obsidian (https://obsidian.md) that uses Verovio – a fast, portable and lightweight open-source library for engraving Music Encoding Initiative (MEI) music scores (and also ABC and MusicXML) into SVG.

The plugin already has the following features:
- rendering MEI, ABC and MusicXML notation dynamically (working) from the Obsidian folder and URLs
- download button for the rendered SVG-FIle (visible by hovering the mouse over the renderd music)
- a settings menu to change the rendering options (working, though not sure if every option is working, espeically the font option)

And I would love to implement these as well (But I'm not a programmer and thus can't get it to work right now)
- midi playback and note highlightingwith midi.js (as stated in the Verovio docs https://book.verovio.org/interactive-notation/playing-midi.html). Start and Stop Buttons already in the code but without function.
- the possibility to just render a selection of bars (as stated here https://book.verovio.org/interactive-notation/content-selection.html)
- the possibility to render not just URLs but also direct code like the ABCJS plugin https://github.com/abcjs-music/obsidian-plugin-abcjs


## Manually installing the plugin

- Copy over `main.js`, `styles.css`, `manifest.json` to your vault `VaultFolder/.obsidian/plugins/Verovio-Music-Renderer/`.


