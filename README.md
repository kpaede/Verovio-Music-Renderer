# Verovio Music Renderer for Obsidian

![](demo.gif)

This is a plugin for [Obsidian](https://obsidian.md) that uses [Verovio](https://www.verovio.org/) – a lightweight open-source library for engraving Music Encoding Initiative (MEI) music scores (as well as ABC and MusicXML files) into SVG. With this plugin, you can render musical scores seamlessly within Obsidian, enhancing your efficiency when working with written music.

The plugin currently has the following features:
- Rendering MEI, ABC, MusicXML, PAE notation dynamically from files in the Obsidian folder (relative paths) and URLs (absolute paths) and also directly from code blocks.
- A download button for the rendered SVG file (the toolbar is visible when hovering the mouse over the rendered music).
- A settings menu to adjust various rendering options.
- Sound playback of the rendered music.
- Highlighting of live playback notes, synced to the sound playback (syncing is still not fully reliable, though).
- Opening the rendered file via an external editor (if you want to edit your files with one click).
- Rendering specific measure selections.
- Page turning buttons and automatic page turning
- A side panel where you can edit your musical code (with syntax highlighting for XML and MEI). You can click on a rendered note and it will jump to the right line of code. (Only works for MEI code directly from the code block, not for linked files.)

## How to Use
Install the plugin, then copy the following into your Obsidian document:

```
COPY FROM HERE
```verovio
https://www.verovio.org/examples/downloads/Schubert_Lindenbaum.mei
```COPY UNTIL HERE

```

or just use a filename from a file in your Obsidian Vault like this:

```
COPY FROM HERE
```verovio
Schubert_Lindenbaum.mei
```COPY UNTIL HERE

```

you can also render directly from the Obsidian Code Block:

it works with MusicXML

```
COPY FROM HERE
```verovio
<mei xmlns="http://www.music-encoding.org/ns/mei">
  <music>
    <body>
      <mdiv>
        <score>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="e" oct="4" dur="4"/>
                  <note pname="g" oct="4" dur="4"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>
```COPY UNTIL HERE
```

also with ABC Notation 

```
COPY FROM HERE
```verovio
X:1
T: Test-Melody
M:4/4
K:C
C D | G A B c |
```COPY UNTIL HERE
```

and of course MEI

```
COPY FROM HERE
```verovio
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.0">
  <meiHead>
    <fileDesc>
      <titleStmt>
        <title>Another Test</title>
      </titleStmt>
      <pubStmt/>
    </fileDesc>
  </meiHead>
  <music>
    <body>
      <mdiv>
        <score>
          <scoreDef meter.count="4" meter.unit="4" key.sig="0">
            <staffGrp>
              <staffDef n="1" lines="5" clef.shape="G" clef.line="2"/>
            </staffGrp>
          </scoreDef>
          <section>
            <measure n="1">
              <staff n="1">
                <layer n="1">
                  <note pname="c" oct="4" dur="4"/>
                  <note pname="d" oct="4" dur="4"/>
                  <note pname="e" oct="4" dur="4"/>
                  <note pname="f" oct="4" dur="4"/>
                </layer>
              </staff>
            </measure>
          </section>
        </score>
      </mdiv>
    </body>
  </music>
</mei>
```COPY UNTIL HERE
```
and also PAE
```
COPY FROM HERE
```verovio
@clef:G-2
@keysig:
@timesig:c
@data:2''C'B/=/''CC/=/2-4DE/2-8{'B''C+C'B}/2''C-//
```COPY UNTIL HERE
```
## Side Panel
You can open a side panel where you can directly edit your musical code (with syntax highlighting for XML and MEI). You can click on a rendered note and it will jump to the right line of code. That of course only works for MEI code in the code block, not for linked files.

## Rendering Options
In the settings menu of the Obsidian plugin, you can adjust several important parameters globally for all renderings. 
You can also apply custom settings for a specific rendering by adding them to your code block in Obsidian. Please refer to the [Verovio documentation](https://book.verovio.org/toolkit-reference/toolkit-options.html) for available options. Note that not all options may work and that they interfere with each other. Please note, these won't work (yet), when you're rendering from a code block.

```
COPY FROM HERE
```verovio
Schubert_Lindenbaum.mei
font: Leland
scale: 10
breaks: encoded
```COPY UNTIL HERE

```

## Rendering Measure Selections
A special feature of this plugin is rendering predefined measures. To render measures 1-10, you can use the measureRange command like in this example. Please note that in this example, measure 20 is not included in the rendering. The type of breaks you choose to render can greatly influence the output (or even make the plugin render nothing at all). For example, "encoded" breaks can result in a blank rendering if no encoded break exists in your selection. Because of this, "breaks: none" is added to the example below, which might be a good default option for rendering musical snippets. You can also use "start" and "end" instead of numbers, e.g. `measureRange: 15-end` – or just render single measures: `measureRange: 5`


```
COPY FROM HERE
```verovio
Schubert_Lindenbaum.mei
scale: 50
breaks: none
measureRange: 1-20
```COPY UNTIL HERE

```

## Installing the Plugin
This plugin is part of the Obsidian community plugins. You can also install it via [BRAT](https://github.com/TfTHacker/obsidian42-brat) (just add the URL you're on right now as a beta plugin).
You can also do it manually: Copy the files main.js and manifest.json from the release (look right) into the plugin folder of your vault like this: VaultFolder/.obsidian/plugins/Verovio-Music-Renderer/.

## If You Are Cloning This Project, Read This:
- Audio playback requires changing the _root2.default.soundfontUrl = in /node_modules/lz-midi/lib/midi.js to the following (or a different) URL like this: _root2.default.soundfontUrl = 'https://paulrosen.github.io/midi-js-soundfonts/FluidR3_GM/';. I am using [Paul Rosens midi-js-soundfonts](https://github.com/paulrosen/midi-js-soundfonts)
- I disabled logging of the MIDI-file by //ing line 1472 in the midi.js of lz-midi: '//console.log('MidiFile 输入数据', data);''



## Additionally Used (With Many Thanks):
- [Verovio](https://github.com/rism-digital/verovio) – please support [RISM](https://rism.digital/) and their amazing work
- [lz-midi](https://github.com/AAlittleWhite/lz-midi)

I have just rudimentary programming skills and use mostly ChatGPT.

## FAQ

Q: Is it working with the mobile versions of Obsidian?
A: Yes, but the buttons for download and opening externally don't work.

Q: The "folder" icon doesn't open anything.
A: You need to define a default application for that file type to open it in your operating system.

Q: When I use "measureRange," it just renders a blank box.
A: Try changing the breaks type in the plugin options.

Q: I don't hear anything, and playback isn't starting.
A: Make sure you're connected to the internet to load the SoundFont for playback. It won't work offline, and note highlighting won't either. Check the Obsidian dev tools when in doubt.