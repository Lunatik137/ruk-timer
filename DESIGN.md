---
name: RukTimer
description: Vietnamese-first practice timer and Rubik's Cube training workspace.
colors:
  canvas: "#101214"
  surface: "#181b1e"
  dialog: "#202428"
  foreground: "#f8fafc"
  secondary-text: "#cbd5e1"
  accent: "#67e8f9"
  holding: "#fcd34d"
  ready: "#86efac"
  error: "#fda4af"
typography:
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
  timing:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontWeight: 700
    lineHeight: 1
spacing:
  compact: "8px"
  gutter: "12px"
  section: "16px"
  touch-target: "44px"
rounded:
  control: "8px"
  panel: "16px"
---

## Overview

RukTimer serves speedcubers and learners using keyboard or touch. Its primary job is to get a Guest from scramble to a saved solve without a sign-in step. Keep the information that matters while practicing within easy reach. Verify improvements with task completion, time to first solve and the number of wrong taps.

## Colors

Use flat canvas, panel and dialog surfaces from the shared theme. Keep color differences between themes subtle so the clock and scramble remain prominent. Cyan marks actionable controls and the selected destination. Amber signals a hold or inspection. Green signals readiness. Rose marks errors and destructive actions. Include text or a recognizable control state alongside color.

## Typography

Web and PWA use locally bundled Geist and Geist Mono. Expo uses system sans and platform monospace with the same palette. Use tabular digits for timing, splits and scramble notation. Keep minutes and hours legible at narrow widths.

## Layout

**Mobile wireframe** — Brand and account controls → puzzle and session selectors → scramble and its controls → timer and state instruction → solve actions → secondary practice modes. The fixed bottom bar links Timer, CFOP, AI and Video, History, and Statistics. At desktop widths, retain the top mode switch and side panels for Statistics and History.

**Guest solve** — Choose puzzle and session → read or regenerate scramble → hold → ready → release → solve → stop → review result or open History. A canceled press returns to waiting. A generating scramble has a loading label. A new session starts with empty history and can be named during creation. Confirm destructive session actions.

## Elevation & Depth

Use borders to separate controls and task areas. Keep the timer area flat. Reserve shadows for an overlay that needs separation from underlying controls.

## Shapes

Use the Tailwind 8–16px corner scale for controls and panels. Primary touch controls should have a 44px target and visible keyboard focus.

## Components

- **Header** — Brand, account and settings lead on mobile. The puzzle and session are adjacent. Session actions rise from the session control.
- **Scramble** — The move sequence is the strongest line. Keep new scramble near the training selector. Put previous, copy, edit and Cross help together.
- **Timer** — Mode changes sit below the timing surface. A concise live status communicates hold, ready, inspection, running and saved-time states without announcing every clock tick.
- **Video Analyzer** — “Phân tích clip” opens a new recording and starts the on-device scan in one step. Opening a video file also starts its first scan. Keep retry, manual marks, device download and explicit cloud upload distinct.
- **Navigation** — Desktop uses a segmented row and mobile uses an icon with a short label. Underline the current destination and keep keyboard focus distinct. The mobile History count sits beside the icon, including at zero. Use 11px for the compact mobile labels and count, and expose the exact count in the accessible name.
- **Video intake** — Use a filled file action and an outlined camera action. Stack them at narrow widths. Explain that selecting a clip starts analysis automatically. Keep the clip and timeline available after opening a file.
- **Practice progress** — Place the date range and period filter above a single grid of metrics. Compare with the preceding period of the same length. Use one cyan series for daily standard solves, including DNF, and provide the same values in a disclosure table and weekly calendar. Label CFOP-inclusive streaks and lifetime achievements.
- **Lịch sử giải** — Keep the solve index, Time and Ao5 in separate columns. On narrow panels, open the existing solve detail for penalties and deletion. Keep the direct actions in wider panels. Size the clock to the available panel width when a time has extra digits.
- **Footer** — Reserve room for the navigation bar and device safe area. On Bạn bè and the duel lobby, use the available page height to place the footer at the bottom of short pages. Let it follow the content as the page grows. Keep the Timer footer out of the focus order during a solve.
- **Cài đặt** — Group timing, display and backup separately. Keep the close button visible while the body scrolls. Stack selects below their labels in narrow dialogs. Check each option and the backup preview at 320px, in landscape and with enlarged text.
- **Đấu 1v1** — Give it a dedicated desktop and mobile navigation item. Put invitation entry before room creation on narrow screens. Let invited guests choose an open seat before entering their name. Once play starts, prioritise score and status, then the Scramble and timer. Put the two times and confirmation together. Keep confirmed round details available in match history.
- **Thao tác lượt đấu** — Put readiness, Inspection and submission in the same area below the Scramble. Show the wait for the other player after readiness. Move keyboard focus to the clock when the player starts Inspection with the keyboard. Keep Space from scrolling the page during the round.
- **Cuộc gọi 1v1** — Use equal-width columns on desktop. Put the clock and Scramble on the left and the opponent video on the right, with self-view in a small corner. Keep camera, switch camera and mic in one toolbar under the video. On phones, put the clock first and keep the same call controls.
- **Bố cục phòng 1v1** — Pair the player seats on a single scoreboard. Keep the current phase and its action in the main column. Keep both players on the same layout. Put host and referee controls below the shared play and call areas. On mobile, place these after the current round. Default new rooms to invite-only and list open public rooms in the lobby.
- **Quyền vào phòng 1v1** — Give the referee a separate seat. Show pending or denied status on the invitation page. Keep the host and referee’s admission controls below the live match controls.
- **Quay lại trận 1v1** — Place active rooms above the lobby forms. Use the same room link to restore the server snapshot. Show reconnecting status and retry beside the match without replacing the timer. In the waiting room, tell guests what happens after admission.
- **Đóng phòng 1v1** — Keep the close action below the match controls. Explain that closing ends the room for everyone and leaves unfinished games unscored. Allow a short reconnection window before an empty room expires.
- **Sảnh 1v1** — Lead with an original speedcube image and a clear path to creating a room or opening an invite. Link entry, open public rooms and match history share the main column. The room form sits alongside on wide screens. Show the puzzle, format and open seats on public room rows. Show resumable matches above both columns.
- **Bạn bè** — Give friends their own lobby destination. Pair search with invitations and the friends list on wider screens. Open direct messages on demand. Keep profile visibility and the invite action beside the people they affect.

## Do's and Don'ts

Use the product's Vietnamese terminology and Lucide icons for controls with a clear action. Keep feedback local to the relevant control. Respect reduced motion and native browser zoom. Keep photos and decorative animation out of the timing workflow.


## Tham khảo sảnh đấu

| Nền tảng | Quan sát áp dụng vào RukTimer |
|---|---|
| [Lichess](https://lichess.org/page/blind-mode-tutorial#32-playing-with-friends) | Tách phòng công khai khỏi lời mời theo người hoặc qua link. |
| [Chess.com](https://support.chess.com/en/articles/8588467-how-do-i-play-a-friend) | Mời trực tiếp từ danh sách bạn bè; lời mời trận trực tiếp hết hiệu lực khi phòng chờ đóng. |
| [League of Legends](https://support-leagueoflegends.riotgames.com/hc/en-us/articles/50403894118931-Linking-your-Riot-Account-to-Discord) | Giữ cả thao tác mời người cụ thể và link có thể chia sẻ. |
| [osu!](https://osu.ppy.sh/wiki/en/Client/Interface/Multiplayer) | Tách quyền bắt đầu trận khỏi giao diện chung của người chơi; mỗi phòng có kênh chat riêng. |
| [Counter-Strike](https://blog.counter-strike.net/?s=FAQ) | Giữ danh sách phòng, quyền điều hành và lời mời thành các thao tác riêng. |
| [Apex Legends](https://careers.ea.com/en-gb/games/apex-legends/about/frequently-asked-questions) | Đưa lời mời vào sảnh để người nhận chọn mở phòng. |
| [Rocket League](https://www.epicgames.com/help/c-37599050/c-32343914/how-do-i-use-my-friends-list-in-rocket-league-a14432997) | Hiện lời mời đấu và yêu cầu kết bạn trong mục Bạn bè. |
| [Fortnite](https://www.epicgames.com/help/c-34254770/c-33726977/a16697235?lang=en-US) | Áp dụng quyền riêng cho chat phòng và tin nhắn bạn bè. |
| [Roblox](https://en.help.roblox.com/hc/en-us/articles/32461054421012-Party-FAQ) | Tách cuộc trò chuyện trong trận khỏi cuộc trò chuyện dài hạn. |
| [Steam](https://help.steampowered.com/en/faqs/view/595C-42F4-3B66-E02F) | Đặt thao tác nhắn tin và mời vào phòng bên cạnh tên bạn. |
| [PlayStation](https://www.playstation.com/en-ca/support/games/send-messages-ps5/) | Cho lời mời xuất hiện như một thẻ trong cuộc trò chuyện. |
| [Nintendo Switch](https://en-americas-support.nintendo.com/app/answers/detail/a_id/22326/~/how-to-add-friends) | Người nhận chủ động đồng ý yêu cầu kết bạn. |

Dùng [Google Meet](https://support.google.com/meet/answer/10550593?hl=en) và [Zoom](https://support.zoom.com/hc/en/article?id=zm_kb&sysparm_article=KB0063672) làm mẫu bố trí video lớn và ô xem trước. Giữ hai luồng xác thực đang có: cookie phòng cho chat trong phòng, tài khoản Supabase cho bạn bè và tin nhắn riêng. Chỉ cập nhật chat khi khu vực đó đang mở và tab đang hiển thị.

Trong RukTimer, tìm bạn theo đầu tên hiển thị, có hoặc không dấu tiếng Việt. Dùng nhãn ngắn để phân biệt người trùng tên. Hồ sơ cũ giữ quyền riêng tư cho đến khi người chơi bật cho phép tìm theo tên.


For the lobby redesign, use [Scrolltide](https://www.scrolltide.co/) as a reference for image-only scroll motion, [Supaste in Navbar Gallery](https://www.navbar.gallery/navbar/supaste) for a simple navigation row, [ESR in Footer Design](https://www.footer.design/sites/esr) for compact utility links, [Neon in CTA Gallery](https://www.cta.gallery/cta/neon) for primary and secondary actions, and [Linear in Refero Styles](https://styles.refero.design/style/90ce5883-bb24-4466-93f7-801cd617b0d1) for quiet dividers and row hierarchy.
