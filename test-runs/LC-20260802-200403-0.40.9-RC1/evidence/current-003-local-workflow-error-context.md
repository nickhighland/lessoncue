# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: local-workflow.spec.ts >> fresh local server supports setup, direct lesson upload, retention, and online media
- Location: tests/browser/local-workflow.spec.ts:58:1

# Error details

```
TimeoutError: locator.fill: Timeout 10000ms exceeded.
Call log:
  - waiting for getByLabel('Substitute or teacher instructions')

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Skip to main content" [ref=e3] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e4]:
    - complementary [ref=e5]:
      - generic [ref=e8]:
        - strong [ref=e9]: LessonCue
        - generic [ref=e10]: LessonCue Browser Test
      - generic [ref=e11]:
        - generic [ref=e12]: ↥
        - generic [ref=e13]:
          - strong [ref=e14]: 40.2 GB
          - text: upload space free
      - navigation [ref=e15]:
        - generic [ref=e16]:
          - generic [ref=e17]: Teaching
          - button "⌂ Dashboard" [ref=e18] [cursor=pointer]:
            - generic [ref=e19]: ⌂
            - generic [ref=e20]: Dashboard
          - button "⌁ Controller" [ref=e21] [cursor=pointer]:
            - generic [ref=e22]: ⌁
            - generic [ref=e23]: Controller
          - button "▤ Classes" [ref=e24] [cursor=pointer]:
            - generic [ref=e25]: ▤
            - generic [ref=e26]: Classes
          - button "↻ Templates" [ref=e27] [cursor=pointer]:
            - generic [ref=e28]: ↻
            - generic [ref=e29]: Templates
          - button "◉ Audience" [ref=e30] [cursor=pointer]:
            - generic [ref=e31]: ◉
            - generic [ref=e32]: Audience
          - button "□ Calendar" [ref=e33] [cursor=pointer]:
            - generic [ref=e34]: □
            - generic [ref=e35]: Calendar
        - generic [ref=e36]:
          - generic [ref=e37]: Media & Devices
          - button "▶ Media Library" [ref=e38] [cursor=pointer]:
            - generic [ref=e39]: ▶
            - generic [ref=e40]: Media Library
          - button "▣ Screens" [ref=e41] [cursor=pointer]:
            - generic [ref=e42]: ▣
            - generic [ref=e43]: Screens
        - generic [ref=e44]:
          - generic [ref=e45]: Administration
          - button "♙ Users" [ref=e46] [cursor=pointer]:
            - generic [ref=e47]: ♙
            - generic [ref=e48]: Users
          - button "⚙ Settings" [ref=e49] [cursor=pointer]:
            - generic [ref=e50]: ⚙
            - generic [ref=e51]: Settings
      - generic [ref=e52]:
        - generic [ref=e55]:
          - strong [ref=e56]: Server online
          - generic [ref=e57]: 127.0.0.1:5117
        - button "Test Administrator Updated Service Admin · Manage account" [ref=e58] [cursor=pointer]:
          - text: Test Administrator Updated
          - generic [ref=e59]: Service Admin · Manage account
    - main [ref=e60]:
      - button "← Back to Learning Lab" [ref=e61] [cursor=pointer]
      - generic [ref=e62]:
        - generic [ref=e63]:
          - text: LESSON BUILDER
          - heading "Sample Lesson" [level=1] [ref=e64]
          - paragraph [ref=e65]: Monday, August 10, 2026 · Manifest version 14
        - generic [ref=e66]:
          - button "Print run sheet" [ref=e67] [cursor=pointer]
          - button "Copy or move" [ref=e68] [cursor=pointer]
          - button "Add media" [ref=e69] [cursor=pointer]
      - region "Lesson editor mode" [ref=e70]:
        - generic [ref=e71]:
          - strong [ref=e72]: Advanced editing
          - generic [ref=e73]: Crop, rotation, speed, repeats, precise timing, fades, and transitions.
        - group "Choose editor mode" [ref=e74]:
          - button "Simple" [ref=e75] [cursor=pointer]
          - button "Advanced" [ref=e76] [cursor=pointer]
      - generic [ref=e77]:
        - button "1 Lesson settings Title, date, timing, notes" [ref=e78] [cursor=pointer]:
          - generic [ref=e79]: "1"
          - generic [ref=e80]:
            - strong [ref=e81]: Lesson settings
            - generic [ref=e82]: Title, date, timing, notes
        - button "2 Playback sequence 7 cues · 10m 4s" [ref=e83] [cursor=pointer]:
          - generic [ref=e84]: "2"
          - generic [ref=e85]:
            - strong [ref=e86]: Playback sequence
            - generic [ref=e87]: 7 cues · 10m 4s
      - generic [ref=e88]:
        - generic [ref=e89]:
          - generic [ref=e90]:
            - heading "Playback sequence" [level=2] [ref=e91]
            - paragraph [ref=e92]: Pre-roll loops, countdown runs once, then lesson media plays in order.
          - generic [ref=e93]: 7 items
        - generic [ref=e94]:
          - generic [ref=e95]: PREVIEW WITH TRIMS & FADES
          - button "▶ Welcome Loop" [ref=e96] [cursor=pointer]
          - button "▶ Five-Minute Countdown" [ref=e97] [cursor=pointer]
          - button "▶ Main Presentation" [ref=e98] [cursor=pointer]
          - button "▶ Browser Test Audio" [ref=e99] [cursor=pointer]
          - button "▶ bulk-cue-one.wav" [ref=e100] [cursor=pointer]
          - button "▶ bulk-cue-two.wav" [ref=e101] [cursor=pointer]
          - button "▶ Browser Compatibility Video" [ref=e102] [cursor=pointer]
        - generic [ref=e103]:
          - generic [ref=e104]:
            - checkbox "Select all cues" [ref=e105]
            - text: Select all cues
          - article [ref=e106]:
            - checkbox "Select cue Welcome Loop" [ref=e108]
            - generic [ref=e109]:
              - button "Move Welcome Loop up" [disabled] [ref=e110] [cursor=pointer]: ↑
              - generic [ref=e111]: "1"
              - button "Move Welcome Loop down" [ref=e112] [cursor=pointer]: ↓
            - generic [ref=e113]: ▶
            - generic [ref=e114]:
              - generic [ref=e115]:
                - generic [ref=e116]: PRE-ROLL
                - strong [ref=e117]: Welcome Loop
              - generic [ref=e118]: video · 0:30
              - button "▥ Visually trim both ends & edit fades" [ref=e119] [cursor=pointer]
              - generic [ref=e120]:
                - generic [ref=e121]:
                  - generic [ref=e122]: Role
                  - combobox "Role" [ref=e123]:
                    - option "Pre-roll" [selected]
                    - option "Countdown"
                    - option "Main lesson"
                - generic [ref=e124]:
                  - generic [ref=e125]: At the end
                  - combobox "End behavior" [ref=e126]:
                    - option "Play next cue"
                    - option "Loop continuously" [selected]
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e127]:
                  - generic [ref=e128]: Cue volume
                  - generic [ref=e129]:
                    - spinbutton "Cue volume %" [ref=e130]: "100"
                    - generic [ref=e131]: "%"
                - generic [ref=e132]:
                  - generic [ref=e133]: Picture
                  - combobox "Picture fit" [ref=e134]:
                    - option "Fit on screen" [selected]
                    - option "Fill screen (crop edges)"
                    - option "Letterbox on black"
                - generic [ref=e135]:
                  - checkbox "Mute cue" [ref=e136]
                  - text: Mute cue
                - generic [ref=e137]:
                  - checkbox "Flexible timing" [ref=e138]
                  - text: Flexible timing
              - generic [ref=e139]:
                - generic [ref=e140]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e141]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e142]: Shown beside this cue on the phone controller and printed run sheet.
              - generic [ref=e145]: fit · cut
              - group [ref=e146]:
                - generic "Advanced cue controls" [ref=e147] [cursor=pointer]
                - generic [ref=e148]:
                  - generic [ref=e149]:
                    - generic [ref=e150]: Display title
                    - textbox "Display title" [ref=e151]: Welcome Loop
                  - generic [ref=e152]:
                    - generic [ref=e153]: Playback speed
                    - generic [ref=e154]:
                      - spinbutton "Playback speed %" [ref=e155]: "100"
                      - generic [ref=e156]: "%"
                  - generic [ref=e157]:
                    - generic [ref=e158]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e159]: "1"
                  - generic [ref=e160]:
                    - generic [ref=e161]: Rotate
                    - combobox "Rotate" [ref=e162]:
                      - option "No rotation" [selected]
                      - option "90° clockwise"
                      - option "180°"
                      - option "270° clockwise"
                  - generic [ref=e163]:
                    - generic [ref=e164]: Background
                    - textbox "Background" [ref=e165]: "#000000"
                  - generic [ref=e166]:
                    - generic [ref=e167]: Transition
                    - combobox "Transition" [ref=e168]:
                      - option "Cut" [selected]
                      - option "Fade through black"
                  - generic [ref=e169]:
                    - generic [ref=e170]: Crop left
                    - generic [ref=e171]:
                      - spinbutton "Crop left %" [ref=e172]: "0"
                      - generic [ref=e173]: "%"
                  - generic [ref=e174]:
                    - generic [ref=e175]: Crop right
                    - generic [ref=e176]:
                      - spinbutton "Crop right %" [ref=e177]: "0"
                      - generic [ref=e178]: "%"
                  - generic [ref=e179]:
                    - generic [ref=e180]: Crop top
                    - generic [ref=e181]:
                      - spinbutton "Crop top %" [ref=e182]: "0"
                      - generic [ref=e183]: "%"
                  - generic [ref=e184]:
                    - generic [ref=e185]: Crop bottom
                    - generic [ref=e186]:
                      - spinbutton "Crop bottom %" [ref=e187]: "0"
                      - generic [ref=e188]: "%"
                  - generic [ref=e189]:
                    - generic [ref=e190]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e191]: "0"
                  - generic [ref=e192]:
                    - generic [ref=e193]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e194]
                  - generic [ref=e195]:
                    - generic [ref=e196]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e197]: "0"
                  - generic [ref=e198]:
                    - generic [ref=e199]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e200]: "0"
                  - generic [ref=e201]:
                    - generic [ref=e202]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e203]:
                      - /placeholder: Shown during playback
                - generic [ref=e204]:
                  - generic [ref=e205]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e206]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e207]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e208]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e209] [cursor=pointer]
          - article [ref=e210]:
            - checkbox "Select cue Five-Minute Countdown" [ref=e212]
            - generic [ref=e213]:
              - button "Move Five-Minute Countdown up" [ref=e214] [cursor=pointer]: ↑
              - generic [ref=e215]: "2"
              - button "Move Five-Minute Countdown down" [ref=e216] [cursor=pointer]: ↓
            - generic [ref=e217]: ▶
            - generic [ref=e218]:
              - generic [ref=e219]:
                - generic [ref=e220]: COUNTDOWN
                - strong [ref=e221]: Five-Minute Countdown
              - generic [ref=e222]: video · 5:00
              - button "▥ Visually trim both ends & edit fades" [ref=e223] [cursor=pointer]
              - generic [ref=e224]:
                - generic [ref=e225]:
                  - generic [ref=e226]: Role
                  - combobox "Role" [ref=e227]:
                    - option "Pre-roll"
                    - option "Countdown" [selected]
                    - option "Main lesson"
                - generic [ref=e228]:
                  - generic [ref=e229]: At the end
                  - combobox "End behavior" [ref=e230]:
                    - option "Play next cue" [selected]
                    - option "Loop continuously"
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e231]:
                  - generic [ref=e232]: Cue volume
                  - generic [ref=e233]:
                    - spinbutton "Cue volume %" [ref=e234]: "100"
                    - generic [ref=e235]: "%"
                - generic [ref=e236]:
                  - generic [ref=e237]: Picture
                  - combobox "Picture fit" [ref=e238]:
                    - option "Fit on screen" [selected]
                    - option "Fill screen (crop edges)"
                    - option "Letterbox on black"
                - generic [ref=e239]:
                  - checkbox "Mute cue" [ref=e240]
                  - text: Mute cue
                - generic [ref=e241]:
                  - checkbox "Flexible timing" [ref=e242]
                  - text: Flexible timing
              - generic [ref=e243]:
                - generic [ref=e244]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e245]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e246]: Shown beside this cue on the phone controller and printed run sheet.
              - generic [ref=e249]: fit · cut
              - group [ref=e250]:
                - generic "Advanced cue controls" [ref=e251] [cursor=pointer]
                - generic [ref=e252]:
                  - generic [ref=e253]:
                    - generic [ref=e254]: Display title
                    - textbox "Display title" [ref=e255]: Five-Minute Countdown
                  - generic [ref=e256]:
                    - generic [ref=e257]: Playback speed
                    - generic [ref=e258]:
                      - spinbutton "Playback speed %" [ref=e259]: "100"
                      - generic [ref=e260]: "%"
                  - generic [ref=e261]:
                    - generic [ref=e262]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e263]: "1"
                  - generic [ref=e264]:
                    - generic [ref=e265]: Rotate
                    - combobox "Rotate" [ref=e266]:
                      - option "No rotation" [selected]
                      - option "90° clockwise"
                      - option "180°"
                      - option "270° clockwise"
                  - generic [ref=e267]:
                    - generic [ref=e268]: Background
                    - textbox "Background" [ref=e269]: "#000000"
                  - generic [ref=e270]:
                    - generic [ref=e271]: Transition
                    - combobox "Transition" [ref=e272]:
                      - option "Cut" [selected]
                      - option "Fade through black"
                  - generic [ref=e273]:
                    - generic [ref=e274]: Crop left
                    - generic [ref=e275]:
                      - spinbutton "Crop left %" [ref=e276]: "0"
                      - generic [ref=e277]: "%"
                  - generic [ref=e278]:
                    - generic [ref=e279]: Crop right
                    - generic [ref=e280]:
                      - spinbutton "Crop right %" [ref=e281]: "0"
                      - generic [ref=e282]: "%"
                  - generic [ref=e283]:
                    - generic [ref=e284]: Crop top
                    - generic [ref=e285]:
                      - spinbutton "Crop top %" [ref=e286]: "0"
                      - generic [ref=e287]: "%"
                  - generic [ref=e288]:
                    - generic [ref=e289]: Crop bottom
                    - generic [ref=e290]:
                      - spinbutton "Crop bottom %" [ref=e291]: "0"
                      - generic [ref=e292]: "%"
                  - generic [ref=e293]:
                    - generic [ref=e294]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e295]: "0"
                  - generic [ref=e296]:
                    - generic [ref=e297]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e298]
                  - generic [ref=e299]:
                    - generic [ref=e300]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e301]: "0"
                  - generic [ref=e302]:
                    - generic [ref=e303]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e304]: "0"
                  - generic [ref=e305]:
                    - generic [ref=e306]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e307]:
                      - /placeholder: Shown during playback
                - generic [ref=e308]:
                  - generic [ref=e309]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e310]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e311]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e312]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e313] [cursor=pointer]
          - article [ref=e314]:
            - checkbox "Select cue Main Presentation" [ref=e316]
            - generic [ref=e317]:
              - button "Move Main Presentation up" [ref=e318] [cursor=pointer]: ↑
              - generic [ref=e319]: "3"
              - button "Move Main Presentation down" [ref=e320] [cursor=pointer]: ↓
            - generic [ref=e321]: ▶
            - generic [ref=e322]:
              - generic [ref=e323]:
                - generic [ref=e324]: LESSON
                - strong [ref=e325]: Main Presentation
              - generic [ref=e326]: video · 10:00
              - button "▥ Visually trim both ends & edit fades" [ref=e327] [cursor=pointer]
              - generic [ref=e328]:
                - generic [ref=e329]:
                  - generic [ref=e330]: Role
                  - combobox "Role" [ref=e331]:
                    - option "Pre-roll"
                    - option "Countdown"
                    - option "Main lesson" [selected]
                - generic [ref=e332]:
                  - generic [ref=e333]: At the end
                  - combobox "End behavior" [ref=e334]:
                    - option "Play next cue"
                    - option "Loop continuously"
                    - option "Pause on final frame" [selected]
                    - option "Stop playback"
                - generic [ref=e335]:
                  - generic [ref=e336]: Cue volume
                  - generic [ref=e337]:
                    - spinbutton "Cue volume %" [ref=e338]: "100"
                    - generic [ref=e339]: "%"
                - generic [ref=e340]:
                  - generic [ref=e341]: Picture
                  - combobox "Picture fit" [ref=e342]:
                    - option "Fit on screen" [selected]
                    - option "Fill screen (crop edges)"
                    - option "Letterbox on black"
                - generic [ref=e343]:
                  - checkbox "Mute cue" [ref=e344]
                  - text: Mute cue
                - generic [ref=e345]:
                  - checkbox "Flexible timing" [ref=e346]
                  - text: Flexible timing
              - generic [ref=e347]:
                - generic [ref=e348]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e349]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e350]: Shown beside this cue on the phone controller and printed run sheet.
              - generic [ref=e353]: fit · cut
              - group [ref=e354]:
                - generic "Advanced cue controls" [ref=e355] [cursor=pointer]
                - generic [ref=e356]:
                  - generic [ref=e357]:
                    - generic [ref=e358]: Display title
                    - textbox "Display title" [ref=e359]: Main Presentation
                  - generic [ref=e360]:
                    - generic [ref=e361]: Playback speed
                    - generic [ref=e362]:
                      - spinbutton "Playback speed %" [ref=e363]: "100"
                      - generic [ref=e364]: "%"
                  - generic [ref=e365]:
                    - generic [ref=e366]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e367]: "1"
                  - generic [ref=e368]:
                    - generic [ref=e369]: Rotate
                    - combobox "Rotate" [ref=e370]:
                      - option "No rotation" [selected]
                      - option "90° clockwise"
                      - option "180°"
                      - option "270° clockwise"
                  - generic [ref=e371]:
                    - generic [ref=e372]: Background
                    - textbox "Background" [ref=e373]: "#000000"
                  - generic [ref=e374]:
                    - generic [ref=e375]: Transition
                    - combobox "Transition" [ref=e376]:
                      - option "Cut" [selected]
                      - option "Fade through black"
                  - generic [ref=e377]:
                    - generic [ref=e378]: Crop left
                    - generic [ref=e379]:
                      - spinbutton "Crop left %" [ref=e380]: "0"
                      - generic [ref=e381]: "%"
                  - generic [ref=e382]:
                    - generic [ref=e383]: Crop right
                    - generic [ref=e384]:
                      - spinbutton "Crop right %" [ref=e385]: "0"
                      - generic [ref=e386]: "%"
                  - generic [ref=e387]:
                    - generic [ref=e388]: Crop top
                    - generic [ref=e389]:
                      - spinbutton "Crop top %" [ref=e390]: "0"
                      - generic [ref=e391]: "%"
                  - generic [ref=e392]:
                    - generic [ref=e393]: Crop bottom
                    - generic [ref=e394]:
                      - spinbutton "Crop bottom %" [ref=e395]: "0"
                      - generic [ref=e396]: "%"
                  - generic [ref=e397]:
                    - generic [ref=e398]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e399]: "0"
                  - generic [ref=e400]:
                    - generic [ref=e401]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e402]
                  - generic [ref=e403]:
                    - generic [ref=e404]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e405]: "0"
                  - generic [ref=e406]:
                    - generic [ref=e407]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e408]: "0"
                  - generic [ref=e409]:
                    - generic [ref=e410]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e411]:
                      - /placeholder: Shown during playback
                - generic [ref=e412]:
                  - generic [ref=e413]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e414]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e415]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e416]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e417] [cursor=pointer]
          - article [ref=e418]:
            - checkbox "Select cue Browser Test Audio" [ref=e420]
            - generic [ref=e421]:
              - button "Move Browser Test Audio up" [ref=e422] [cursor=pointer]: ↑
              - generic [ref=e423]: "4"
              - button "Move Browser Test Audio down" [ref=e424] [cursor=pointer]: ↓
            - generic [ref=e425]: ♫
            - generic [ref=e426]:
              - generic [ref=e427]:
                - generic [ref=e428]: LESSON
                - strong [ref=e429]: Browser Test Audio
              - generic [ref=e430]: browser-test-audio.wav · 0:01
              - button "▥ Visually trim both ends & edit fades" [ref=e431] [cursor=pointer]
              - generic [ref=e432]:
                - generic [ref=e433]:
                  - generic [ref=e434]: Role
                  - combobox "Role" [ref=e435]:
                    - option "Pre-roll"
                    - option "Countdown"
                    - option "Main lesson" [selected]
                - generic [ref=e436]:
                  - generic [ref=e437]: At the end
                  - combobox "End behavior" [ref=e438]:
                    - option "Play next cue" [selected]
                    - option "Loop continuously"
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e439]:
                  - generic [ref=e440]: Cue volume
                  - generic [ref=e441]:
                    - spinbutton "Cue volume %" [ref=e442]: "100"
                    - generic [ref=e443]: "%"
                - generic [ref=e444]:
                  - checkbox "Mute cue" [ref=e445]
                  - text: Mute cue
                - generic [ref=e446]:
                  - checkbox "Flexible timing" [ref=e447]
                  - text: Flexible timing
              - generic [ref=e448]:
                - generic [ref=e449]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e450]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e451]: Shown beside this cue on the phone controller and printed run sheet.
              - group [ref=e452]:
                - generic "Advanced cue controls" [ref=e453] [cursor=pointer]
                - generic [ref=e454]:
                  - generic [ref=e455]:
                    - generic [ref=e456]: Display title
                    - textbox "Display title" [ref=e457]: Browser Test Audio
                  - generic [ref=e458]:
                    - generic [ref=e459]: Playback speed
                    - generic [ref=e460]:
                      - spinbutton "Playback speed %" [ref=e461]: "100"
                      - generic [ref=e462]: "%"
                  - generic [ref=e463]:
                    - generic [ref=e464]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e465]: "1"
                  - generic [ref=e466]:
                    - generic [ref=e467]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e468]: "0"
                  - generic [ref=e469]:
                    - generic [ref=e470]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e471]
                  - generic [ref=e472]:
                    - generic [ref=e473]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e474]: "0"
                  - generic [ref=e475]:
                    - generic [ref=e476]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e477]: "0"
                  - generic [ref=e478]:
                    - generic [ref=e479]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e480]:
                      - /placeholder: Shown during playback
                - generic [ref=e481]:
                  - generic [ref=e482]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e483]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e484]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e485]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e486] [cursor=pointer]
          - article [ref=e487]:
            - checkbox "Select cue bulk-cue-one.wav" [ref=e489]
            - generic [ref=e490]:
              - button "Move bulk-cue-one.wav up" [ref=e491] [cursor=pointer]: ↑
              - generic [ref=e492]: "5"
              - button "Move bulk-cue-one.wav down" [ref=e493] [cursor=pointer]: ↓
            - generic [ref=e494]: ♫
            - generic [ref=e495]:
              - generic [ref=e496]:
                - generic [ref=e497]: LESSON
                - strong [ref=e498]: bulk-cue-one.wav
              - generic [ref=e499]: bulk-cue-one.wav · 0:01
              - button "▥ Visually trim both ends & edit fades" [ref=e500] [cursor=pointer]
              - generic [ref=e501]:
                - generic [ref=e502]:
                  - generic [ref=e503]: Role
                  - combobox "Role" [ref=e504]:
                    - option "Pre-roll"
                    - option "Countdown"
                    - option "Main lesson" [selected]
                - generic [ref=e505]:
                  - generic [ref=e506]: At the end
                  - combobox "End behavior" [ref=e507]:
                    - option "Play next cue" [selected]
                    - option "Loop continuously"
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e508]:
                  - generic [ref=e509]: Cue volume
                  - generic [ref=e510]:
                    - spinbutton "Cue volume %" [ref=e511]: "65"
                    - generic [ref=e512]: "%"
                - generic [ref=e513]:
                  - checkbox "Mute cue" [ref=e514]
                  - text: Mute cue
                - generic [ref=e515]:
                  - checkbox "Flexible timing" [ref=e516]
                  - text: Flexible timing
              - generic [ref=e517]:
                - generic [ref=e518]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e519]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e520]: Shown beside this cue on the phone controller and printed run sheet.
              - group [ref=e521]:
                - generic "Advanced cue controls" [ref=e522] [cursor=pointer]
                - generic [ref=e523]:
                  - generic [ref=e524]:
                    - generic [ref=e525]: Display title
                    - textbox "Display title" [ref=e526]: bulk-cue-one.wav
                  - generic [ref=e527]:
                    - generic [ref=e528]: Playback speed
                    - generic [ref=e529]:
                      - spinbutton "Playback speed %" [ref=e530]: "100"
                      - generic [ref=e531]: "%"
                  - generic [ref=e532]:
                    - generic [ref=e533]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e534]: "1"
                  - generic [ref=e535]:
                    - generic [ref=e536]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e537]: "0"
                  - generic [ref=e538]:
                    - generic [ref=e539]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e540]
                  - generic [ref=e541]:
                    - generic [ref=e542]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e543]: "0"
                  - generic [ref=e544]:
                    - generic [ref=e545]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e546]: "0"
                  - generic [ref=e547]:
                    - generic [ref=e548]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e549]:
                      - /placeholder: Shown during playback
                - generic [ref=e550]:
                  - generic [ref=e551]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e552]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e553]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e554]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e555] [cursor=pointer]
          - article [ref=e556]:
            - checkbox "Select cue bulk-cue-two.wav" [ref=e558]
            - generic [ref=e559]:
              - button "Move bulk-cue-two.wav up" [ref=e560] [cursor=pointer]: ↑
              - generic [ref=e561]: "6"
              - button "Move bulk-cue-two.wav down" [ref=e562] [cursor=pointer]: ↓
            - generic [ref=e563]: ♫
            - generic [ref=e564]:
              - generic [ref=e565]:
                - generic [ref=e566]: LESSON
                - strong [ref=e567]: bulk-cue-two.wav
              - generic [ref=e568]: bulk-cue-two.wav · 0:01
              - button "▥ Visually trim both ends & edit fades" [ref=e569] [cursor=pointer]
              - generic [ref=e570]:
                - generic [ref=e571]:
                  - generic [ref=e572]: Role
                  - combobox "Role" [ref=e573]:
                    - option "Pre-roll"
                    - option "Countdown"
                    - option "Main lesson" [selected]
                - generic [ref=e574]:
                  - generic [ref=e575]: At the end
                  - combobox "End behavior" [ref=e576]:
                    - option "Play next cue" [selected]
                    - option "Loop continuously"
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e577]:
                  - generic [ref=e578]: Cue volume
                  - generic [ref=e579]:
                    - spinbutton "Cue volume %" [ref=e580]: "65"
                    - generic [ref=e581]: "%"
                - generic [ref=e582]:
                  - checkbox "Mute cue" [ref=e583]
                  - text: Mute cue
                - generic [ref=e584]:
                  - checkbox "Flexible timing" [ref=e585]
                  - text: Flexible timing
              - generic [ref=e586]:
                - generic [ref=e587]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e588]:
                  - /placeholder: What the operator should say or do
                - generic [ref=e589]: Shown beside this cue on the phone controller and printed run sheet.
              - group [ref=e590]:
                - generic "Advanced cue controls" [ref=e591] [cursor=pointer]
                - generic [ref=e592]:
                  - generic [ref=e593]:
                    - generic [ref=e594]: Display title
                    - textbox "Display title" [ref=e595]: bulk-cue-two.wav
                  - generic [ref=e596]:
                    - generic [ref=e597]: Playback speed
                    - generic [ref=e598]:
                      - spinbutton "Playback speed %" [ref=e599]: "100"
                      - generic [ref=e600]: "%"
                  - generic [ref=e601]:
                    - generic [ref=e602]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e603]: "1"
                  - generic [ref=e604]:
                    - generic [ref=e605]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e606]: "0"
                  - generic [ref=e607]:
                    - generic [ref=e608]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e609]
                  - generic [ref=e610]:
                    - generic [ref=e611]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e612]: "0"
                  - generic [ref=e613]:
                    - generic [ref=e614]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e615]: "0"
                  - generic [ref=e616]:
                    - generic [ref=e617]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e618]:
                      - /placeholder: Shown during playback
                - generic [ref=e619]:
                  - generic [ref=e620]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e621]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e622]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e623]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e624] [cursor=pointer]
          - article [ref=e625]:
            - checkbox "Select cue Browser Compatibility Video" [ref=e627]
            - generic [ref=e628]:
              - button "Move Browser Compatibility Video up" [ref=e629] [cursor=pointer]: ↑
              - generic [ref=e630]: "7"
              - button "Move Browser Compatibility Video down" [disabled] [ref=e631] [cursor=pointer]: ↓
            - generic [ref=e632]: ▶
            - generic [ref=e633]:
              - generic [ref=e634]:
                - generic [ref=e635]: LESSON
                - strong [ref=e636]: Browser Compatibility Video
              - generic [ref=e637]: needs-tv-conversion.mp4 · 0:01
              - button "▥ Visually trim both ends & edit fades" [ref=e638] [cursor=pointer]
              - generic [ref=e639]:
                - generic [ref=e640]:
                  - generic [ref=e641]: Role
                  - combobox "Role" [ref=e642]:
                    - option "Pre-roll"
                    - option "Countdown"
                    - option "Main lesson" [selected]
                - generic [ref=e643]:
                  - generic [ref=e644]: At the end
                  - combobox "End behavior" [ref=e645]:
                    - option "Play next cue" [selected]
                    - option "Loop continuously"
                    - option "Pause on final frame"
                    - option "Stop playback"
                - generic [ref=e646]:
                  - generic [ref=e647]: Cue volume
                  - generic [ref=e648]:
                    - spinbutton "Cue volume %" [ref=e649]: "100"
                    - generic [ref=e650]: "%"
                - generic [ref=e651]:
                  - generic [ref=e652]: Picture
                  - combobox "Picture fit" [ref=e653]:
                    - option "Fit on screen"
                    - option "Fill screen (crop edges)" [selected]
                    - option "Letterbox on black"
                - generic [ref=e654]:
                  - checkbox "Mute cue" [ref=e655]
                  - text: Mute cue
                - generic [ref=e656]:
                  - checkbox "Flexible timing" [checked] [ref=e657]
                  - text: Flexible timing
              - generic [ref=e658]:
                - generic [ref=e659]: Teacher / volunteer notes
                - textbox "Teacher / volunteer notes Shown beside this cue on the phone controller and printed run sheet." [ref=e660]:
                  - /placeholder: What the operator should say or do
                  - text: Pause for questions before continuing.
                - generic [ref=e661]: Shown beside this cue on the phone controller and printed run sheet.
              - generic [ref=e664]: fill · rotated 90° · 0.5s fade through black
              - group [ref=e665]:
                - generic "Advanced cue controls" [active] [ref=e666] [cursor=pointer]
                - generic [ref=e667]:
                  - generic [ref=e668]:
                    - generic [ref=e669]: Display title
                    - textbox "Display title" [ref=e670]: Browser Compatibility Video
                  - generic [ref=e671]:
                    - generic [ref=e672]: Playback speed
                    - generic [ref=e673]:
                      - spinbutton "Playback speed %" [ref=e674]: "125"
                      - generic [ref=e675]: "%"
                  - generic [ref=e676]:
                    - generic [ref=e677]: Play count before ending
                    - spinbutton "Play count before ending" [ref=e678]: "2"
                  - generic [ref=e679]:
                    - generic [ref=e680]: Rotate
                    - combobox "Rotate" [ref=e681]:
                      - option "No rotation"
                      - option "90° clockwise" [selected]
                      - option "180°"
                      - option "270° clockwise"
                  - generic [ref=e682]:
                    - generic [ref=e683]: Background
                    - textbox "Background" [ref=e684]: "#000000"
                  - generic [ref=e685]:
                    - generic [ref=e686]: Transition
                    - combobox "Transition" [ref=e687]:
                      - option "Cut"
                      - option "Fade through black" [selected]
                  - generic [ref=e688]:
                    - generic [ref=e689]: Transition duration
                    - generic [ref=e690]:
                      - spinbutton "Transition duration sec" [ref=e691]: "0.5"
                      - generic [ref=e692]: sec
                  - generic [ref=e693]:
                    - generic [ref=e694]: Crop left
                    - generic [ref=e695]:
                      - spinbutton "Crop left %" [ref=e696]: "0"
                      - generic [ref=e697]: "%"
                  - generic [ref=e698]:
                    - generic [ref=e699]: Crop right
                    - generic [ref=e700]:
                      - spinbutton "Crop right %" [ref=e701]: "0"
                      - generic [ref=e702]: "%"
                  - generic [ref=e703]:
                    - generic [ref=e704]: Crop top
                    - generic [ref=e705]:
                      - spinbutton "Crop top %" [ref=e706]: "0"
                      - generic [ref=e707]: "%"
                  - generic [ref=e708]:
                    - generic [ref=e709]: Crop bottom
                    - generic [ref=e710]:
                      - spinbutton "Crop bottom %" [ref=e711]: "0"
                      - generic [ref=e712]: "%"
                  - generic [ref=e713]:
                    - generic [ref=e714]: Start at (seconds)
                    - spinbutton "Start at (seconds)" [ref=e715]: "0"
                  - generic [ref=e716]:
                    - generic [ref=e717]: End at (seconds)
                    - spinbutton "End at (seconds)" [ref=e718]: "0.84"
                  - generic [ref=e719]:
                    - generic [ref=e720]: Fade in (seconds)
                    - spinbutton "Fade in (seconds)" [ref=e721]: "0"
                  - generic [ref=e722]:
                    - generic [ref=e723]: Fade out (seconds)
                    - spinbutton "Fade out (seconds)" [ref=e724]: "0"
                  - generic [ref=e725]:
                    - generic [ref=e726]: Volunteer notes
                    - textbox "Volunteer notes" [ref=e727]:
                      - /placeholder: Shown during playback
                      - text: Pause for questions before continuing.
                - generic [ref=e728]:
                  - generic [ref=e729]:
                    - checkbox "Allow volunteers to skip this cue" [checked] [ref=e730]
                    - text: Allow volunteers to skip this cue
                  - generic [ref=e731]:
                    - checkbox "Normalize audio when a processed derivative is available" [ref=e732]
                    - text: Normalize audio when a processed derivative is available
            - button "×" [ref=e733] [cursor=pointer]
```

# Test source

```ts
  119 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  120 |     const lesson = lessons.find((item: { title: string }) => item.title === "Sample Lesson");
  121 |     return lesson.items.filter((item: { title: string }) => item.title.startsWith("bulk-cue-")).map((item: { volumePercent: number }) => item.volumePercent).join(",");
  122 |   })).toBe("65,65");
  123 | 
  124 |   await page.getByRole("button", { name: "Add media" }).click();
  125 |   await page.getByRole("button", { name: "Upload new media" }).click();
  126 |   const videoUploadForm = page.locator("form").filter({ has: page.getByLabel("Media files") });
  127 |   await videoUploadForm.getByLabel("Media files").setInputFiles({
  128 |     name: "needs-tv-conversion.mp4",
  129 |     mimeType: "video/mp4",
  130 |     buffer: incompatibleVideo(),
  131 |   });
  132 |   await videoUploadForm.getByLabel("Display title").fill("Browser Compatibility Video");
  133 |   await videoUploadForm.getByRole("button", { name: "Upload and add" }).click();
  134 |   await expect(page.getByText("Browser Compatibility Video", { exact: true })).toBeVisible();
  135 |   await expect.poll(async () => page.evaluate(async () => {
  136 |     const items = await fetch("/api/v1/media").then(response => response.json());
  137 |     const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
  138 |     return `${item?.processingStatus}:${item?.compatibilityStatus}`;
  139 |   }), { timeout: 60_000 }).toBe("ready:ready");
  140 |   const playbackDelivery = await page.evaluate(async () => {
  141 |     const items = await fetch("/api/v1/media").then(response => response.json());
  142 |     const item = items.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
  143 |     const response = await fetch(item.playbackUrl);
  144 |     const bytes = new Uint8Array(await response.arrayBuffer());
  145 |     return { contentType: response.headers.get("content-type"), signature: String.fromCharCode(...bytes.slice(4, 8)) };
  146 |   });
  147 |   expect(playbackDelivery).toEqual({ contentType: "video/mp4", signature: "ftyp" });
  148 |   const adaptiveProfiles = await page.evaluate(async () => {
  149 |     const media = await fetch("/api/v1/media").then(response => response.json());
  150 |     const item = media.find((value: { fileName: string }) => value.fileName === "needs-tv-conversion.mp4");
  151 |     const queued = await fetch(`/api/v1/media/${item.id}/transcodes/all`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  152 |     return { id: item.id, queued: queued.status };
  153 |   });
  154 |   expect(adaptiveProfiles.queued).toBe(202);
  155 |   await expect.poll(async () => page.evaluate(async id => {
  156 |     const media = await fetch("/api/v1/media").then(response => response.json());
  157 |     return media.find((item: { id: string }) => item.id === id)?.transcodes.map((item: { profile: string; status: string }) => `${item.profile}:${item.status}`).sort().join(",");
  158 |   }, adaptiveProfiles.id), { timeout: 60_000 }).toBe("h264-480:ready,h264-720:ready");
  159 |   const adaptiveDelivery = await page.evaluate(async id => {
  160 |     const response = await fetch(`/api/v1/media/${id}/transcodes/h264-480`, { headers: { Range: "bytes=0-31" } });
  161 |     const bytes = new Uint8Array(await response.arrayBuffer());
  162 |     return { status: response.status, type: response.headers.get("content-type"), signature: String.fromCharCode(...bytes.slice(4, 8)) };
  163 |   }, adaptiveProfiles.id);
  164 |   expect(adaptiveDelivery).toEqual({ status: 206, type: "video/mp4", signature: "ftyp" });
  165 | 
  166 |   await page.reload();
  167 |   await page.getByRole("button", { name: /Classes$/ }).click();
  168 |   await page.getByRole("button", { name: /Sample Lesson/ }).first().click();
  169 |   const videoCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  170 |   await page.getByRole("button", { name: "Advanced", exact: true }).click();
  171 |   await videoCue.getByLabel("Picture fit").selectOption("fill");
  172 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  173 |   await videoCue.getByLabel("Rotate").selectOption("90");
  174 |   await videoCue.getByLabel("Playback speed").fill("125");
  175 |   await videoCue.getByLabel("Playback speed").press("Tab");
  176 |   await videoCue.getByLabel("Play count before ending").fill("2");
  177 |   await videoCue.getByLabel("Play count before ending").press("Tab");
  178 |   await videoCue.getByLabel("Transition").selectOption("fade-black");
  179 |   await videoCue.getByRole("button", { name: "▥ Visually trim both ends & edit fades" }).click();
  180 |   await expect(page.getByRole("heading", { name: "Visual timeline & fades: Browser Compatibility Video" })).toBeVisible();
  181 |   await expect(page.locator(".trim-handle.trim-start")).toBeVisible();
  182 |   await expect(page.locator(".trim-handle.trim-end")).toBeVisible();
  183 |   await expect(page.locator(".fade-handle.fade-start")).toBeVisible();
  184 |   const timelineBounds = await page.locator(".timeline-art").boundingBox();
  185 |   const outHandleBounds = await page.locator(".trim-handle.trim-end").boundingBox();
  186 |   if (!timelineBounds || !outHandleBounds) throw new Error("Visual timeline handles are unavailable.");
  187 |   await page.locator(".trim-handle.trim-end").hover({ position: { x: 3, y: outHandleBounds.height / 2 } });
  188 |   await page.mouse.down();
  189 |   await page.mouse.move(timelineBounds.x + timelineBounds.width * .85, timelineBounds.y + timelineBounds.height / 2);
  190 |   await page.mouse.up();
  191 |   await expect(page.locator(".timeline-preview-label")).toContainText("Previewing trim out");
  192 |   await page.getByLabel("Fade in · 0.0s").fill("0.4");
  193 |   await page.getByLabel("Fade out · 0.0s").fill("0.4");
  194 |   const visualFade = page.locator(".timeline-player .visual-fade-overlay");
  195 |   await expect(visualFade).toBeAttached();
  196 |   await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = 0; video.dispatchEvent(new Event("timeupdate")); });
  197 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.95);
  198 |   await page.locator(".timeline-player video").evaluate((video: HTMLVideoElement) => { video.currentTime = .2; video.dispatchEvent(new Event("timeupdate")); });
  199 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeGreaterThan(.35);
  200 |   await expect.poll(() => visualFade.evaluate(element => Number((element as HTMLElement).style.opacity))).toBeLessThan(.65);
  201 |   await page.getByRole("button", { name: "Save timeline and markers" }).click();
  202 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  203 |   await page.getByRole("button", { name: "Close dialog" }).click();
  204 |   await expect.poll(() => page.evaluate(async () => {
  205 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  206 |     const cue = lessons.flatMap((lesson: { items: unknown[] }) => lesson.items)
  207 |       .find((item: { title?: string }) => item.title === "Browser Compatibility Video") as {
  208 |         fitMode?: string; rotationDegrees?: number; playbackRatePercent?: number; repeatCount?: number; transitionStyle?: string
  209 |       } | undefined;
  210 |     return cue ? `${cue.fitMode}:${cue.rotationDegrees}:${cue.playbackRatePercent}:${cue.repeatCount}:${cue.transitionStyle}` : "missing";
  211 |   })).toBe("fill:90:125:2:fade-black");
  212 | 
  213 |   const runCue = page.locator(".playlist-item").filter({ hasText: "Browser Compatibility Video" });
  214 |   await runCue.getByLabel("Flexible timing").evaluate((input: HTMLInputElement) => input.click());
  215 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
  216 |   await runCue.getByLabel("Teacher / volunteer notes").fill("Pause for questions before continuing.");
  217 |   await runCue.getByLabel("Teacher / volunteer notes").press("Tab");
  218 |   await expect(page.getByText("Playlist saved.", { exact: false })).toBeVisible();
> 219 |   await page.getByLabel("Substitute or teacher instructions").fill("Check the room display before participants arrive.");
      |                                                               ^ TimeoutError: locator.fill: Timeout 10000ms exceeded.
  220 |   await page.getByLabel("Optional pre-roll livestream monitor").fill("https://example.org/private-monitor");
  221 |   await page.getByRole("button", { name: "Save lesson settings" }).click();
  222 |   await expect(page.getByText("Lesson schedule saved.", { exact: false })).toBeVisible();
  223 |   await page.getByRole("button", { name: "Print run sheet" }).click();
  224 |   const runSheet = page.getByRole("dialog", { name: "Run sheet: Sample Lesson" });
  225 |   await expect(runSheet.getByText("Check the room display before participants arrive.")).toBeVisible();
  226 |   await expect(runSheet.getByText("Pause for questions before continuing.")).toBeVisible();
  227 |   await expect(runSheet.getByText(/FLEXIBLE/)).toBeVisible();
  228 |   await runSheet.getByRole("button", { name: "Close", exact: true }).click();
  229 |   await page.getByRole("button", { name: "Copy or move" }).click();
  230 |   const relocateDialog = page.getByRole("dialog", { name: "Copy or move lesson" });
  231 |   await relocateDialog.getByLabel("Lesson title").fill("Sample Lesson run-of-show copy");
  232 |   await relocateDialog.getByRole("button", { name: "Create copy" }).click();
  233 |   await expect(page.getByText("Lesson copied with its complete run of show.", { exact: false })).toBeVisible();
  234 |   await expect.poll(() => page.evaluate(async () => {
  235 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  236 |     const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
  237 |     const cue = copy?.items.find((item: { title: string }) => item.title === "Browser Compatibility Video");
  238 |     return copy ? `${copy.substituteNotes}:${copy.preRollMonitorUrl}:${cue?.flexibleTime}:${cue?.notes}` : "missing";
  239 |   })).toBe("Check the room display before participants arrive.:https://example.org/private-monitor:true:Pause for questions before continuing.");
  240 |   await page.evaluate(async () => {
  241 |     const lessons = await fetch("/api/v1/lessons").then(response => response.json());
  242 |     const copy = lessons.find((item: { title: string }) => item.title === "Sample Lesson run-of-show copy");
  243 |     await fetch(`/api/v1/lessons/${copy.id}`, { method: "DELETE" });
  244 |   });
  245 | 
  246 |   await page.getByRole("button", { name: "Add media" }).click();
  247 |   await page.getByRole("button", { name: "Add online media or slides" }).click();
  248 |   const onlineForm = page.locator("form").filter({ has: page.getByLabel("Webpage or YouTube URL") });
  249 |   await onlineForm.getByLabel("Webpage or YouTube URL").fill("https://example.org/learning");
  250 |   await onlineForm.getByLabel("Display title").fill("Online Learning Page");
  251 |   await onlineForm.getByRole("button", { name: "Add online media" }).click();
  252 |   await expect(page.getByText("Online media added to the lesson.", { exact: false })).toBeVisible();
  253 |   await expect(page.getByText("Online Learning Page", { exact: true })).toBeVisible();
  254 | 
  255 |   await page.getByRole("button", { name: /Calendar$/ }).click();
  256 |   await page.getByRole("button", { name: "Day", exact: true }).click();
  257 |   await expect(page.locator(".calendar-period")).toBeVisible();
  258 |   await page.getByRole("button", { name: "Week", exact: true }).click();
  259 |   await expect(page.locator(".calendar-week")).toBeVisible();
  260 |   await page.getByRole("button", { name: "Month", exact: true }).click();
  261 |   await expect(page.locator(".calendar-month")).toBeVisible();
  262 |   await page.getByRole("button", { name: "Room", exact: true }).click();
  263 |   await expect(page.locator(".calendar-rooms")).toContainText("Learning Lab");
  264 |   await page.getByRole("button", { name: "Agenda", exact: true }).click();
  265 | 
  266 |   await page.getByRole("button", { name: /Media Library$/ }).click();
  267 |   const audioRow = page.locator(".media-table").filter({ hasText: "browser-test-audio.wav" });
  268 |   await expect(audioRow).toBeVisible();
  269 |   await expect(audioRow.getByRole("button", { name: /Deletes/ })).toBeVisible();
  270 |   await expect(page.locator(".media-table").filter({ hasText: "Online Learning Page" })).toBeVisible();
  271 | 
  272 |   await page.getByRole("button", { name: /Settings$/ }).click();
  273 |   await expect(page.getByRole("navigation", { name: "Settings sections" })).toBeVisible();
  274 |   await page.getByRole("button", { name: /Organization & accounts/ }).click();
  275 |   await expect(page.getByRole("heading", { name: "Registration & email" })).toBeVisible();
  276 |   const mfaPanel = page.locator("section.panel").filter({ has: page.getByRole("heading", { name: "Authenticator MFA" }) });
  277 |   await expect(mfaPanel).toHaveCount(1);
  278 |   await expect(mfaPanel).toBeVisible();
  279 |   await page.getByLabel("Enable Signage").check();
  280 |   await expect.poll(() => page.evaluate(async () =>
  281 |     (await fetch("/api/v1/admin/bootstrap").then(response => response.json())).settings.signageEnabled
  282 |   )).toBe(true);
  283 |   expect(await page.evaluate(async () => (await fetch("/api/v1/auth/register", {
  284 |     method: "POST", headers: { "Content-Type": "application/json" },
  285 |     body: JSON.stringify({ username: "closed-user", displayName: "Closed User", email: "closed@example.org", password: "ClosedAccount42", code: "even-with-a-code" })
  286 |   })).status)).toBe(403);
  287 |   await page.getByLabel("Label", { exact: true }).fill("Browser test registrations");
  288 |   await page.getByLabel("Maximum uses (optional)").fill("2");
  289 |   await page.getByRole("button", { name: "Create code" }).click();
  290 |   await expect(page.getByText("Copy this code now")).toBeVisible();
  291 |   const registrationCode = await page.locator(".secret-reveal code").textContent();
  292 |   expect(registrationCode).toMatch(/^[a-f0-9]{16}$/);
  293 |   const registrationRow = page.locator(".registration-code-list > div").filter({ hasText: "Browser test registrations" });
  294 |   await registrationRow.getByRole("button", { name: "Edit" }).click();
  295 |   const codeDialog = page.getByRole("dialog", { name: "Edit Browser test registrations" });
  296 |   await codeDialog.getByLabel("Maximum uses (leave blank for unlimited)").fill("3");
  297 |   await codeDialog.getByRole("button", { name: "Save limits" }).click();
  298 |   await expect(registrationRow).toContainText("0 of 3 uses");
  299 |   await registrationRow.getByRole("button", { name: "Revoke" }).click();
  300 |   await acceptActionDialog(page);
  301 |   await expect(registrationRow).toContainText("Inactive");
  302 |   await expect(page.getByRole("button", { name: "Save provider first" })).toBeDisabled();
  303 |   await page.getByLabel("Registration mode").selectOption("approval");
  304 |   await page.getByLabel("Account email provider").selectOption("resend");
  305 |   await page.getByLabel("Email API key").fill("browser-layout-placeholder-key");
  306 |   await page.getByLabel("Sender name").fill("LessonCue Browser Test");
  307 |   await page.getByLabel("Verified sender address").fill("accounts@example.org");
  308 |   await page.getByLabel("Public account-link address").fill(new URL(page.url()).origin);
  309 |   await page.getByRole("button", { name: "Save account settings" }).click();
  310 |   await expect(page.getByText("Registration and account email settings saved.", { exact: false })).toBeVisible();
  311 |   await page.getByRole("button", { name: /Media & storage/ }).click();
  312 |   await expect(mfaPanel).toBeHidden();
  313 |   await page.getByLabel("Approved folder paths").fill("General\nLessons\nSignage\nAudio/Classroom");
  314 |   await page.getByLabel("Approved tags").fill("Reusable\nIntro\nOutro\nReference\nWelcome");
  315 |   await page.getByRole("button", { name: "Save approved folders & tags" }).click();
  316 |   await expect(page.getByText("Approved media folders and tags saved.", { exact: false })).toBeVisible();
  317 |   expect(await page.evaluate(async () => (await fetch("/api/v1/media/link", {
  318 |     method: "POST", headers: { "Content-Type": "application/json" },
  319 |     body: JSON.stringify({ url: "https://example.org/rejected", title: "Rejected", folder: "Unapproved", tagsCsv: "Reusable" })
```