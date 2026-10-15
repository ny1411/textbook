# Textbook UI component inventory

This is the source inventory for the frontend redesign in PR #52. Registry components were fetched from their publishers on October 13, 2026, then adapted to Textbook's charcoal, ivory, and muted copper theme. The paths below are relative to `textbook-frontend/`.

| Component | Publisher / source URL | Local implementation | Used in Textbook | Adaptations |
| --- | --- | --- | --- | --- |
| Select Menu | [Xevrion Select Menu](https://lab.xevrion.dev/lab/select-menu), [registry source](https://lab.xevrion.dev/r/select-menu.json) | `components/ui/select-menu.tsx` | Header textbook selector, reasoning mode, diagnostic document filter, audio speed | Preserves selected-item alignment, spring checkmark, typeahead, and scroll behavior. Adds portaled overlays, disabled options, viewport clamping, and accessible labels. |
| Sliding Tabs | [Xevrion Sliding Tabs](https://lab.xevrion.dev/lab/sliding-tabs), [registry source](https://lab.xevrion.dev/r/sliding-tabs.json) | `components/ui/sliding-tabs.tsx` | Chat / Sources navigation in `WorkspaceSidebar` | Preserves stretching underline springs, traveling hover pill, keyboard navigation, and directional panel transitions. Adapts Textbook tokens and full-height sidebar layout; keeps inactive panels mounted and inert to retain state. Fetched October 15, 2026. |
| Hover Card | [Xevrion Hover Card](https://lab.xevrion.dev/lab/hover-card), [registry source](https://lab.xevrion.dev/r/hover-card.json) | `components/ui/hover-card.tsx`, `hover-card.module.css` | Citation previews in `CitationBadge` / `ChatMessage` | Shared traveling preview, source excerpt/page/relevance, hover/focus and pinned touch/click behavior, Escape and View Source, portaled positioning. |
| Upload Button | [Xevrion Upload Button](https://lab.xevrion.dev/lab/upload-button), [registry source](https://lab.xevrion.dev/r/upload-button.json) | `components/ui/upload-button.tsx` | Composer source upload | Original pill-to-ring morph uses actual pending, completion, and failure states. Indeterminate for a single upload; actual completed-file count for batches. Demo progress timers removed. |
| Voice Input | [Spectrum Voice Input](https://ui.spectrumhq.in/blocks/ai-assistants#voice-input), [registry source](https://ui.spectrumhq.in/r/voice-input.json) | `components/spectrumui/blocks/ai-assistants/voice-input.tsx` | Composer microphone control | Controlled by `useVoiceRecording`: permission, recording, real elapsed time, microphone waveform, stop/cancel, transcript, and optional auto-send. Demo clock/equalizer removed. |
| Thinking Dots | [Spectrum Thinking Dots](https://ui.spectrumhq.in/blocks/ai-assistants#thinking-dots), [registry source](https://ui.spectrumhq.in/r/thinking-dots.json) | `components/spectrumui/blocks/ai-assistants/thinking-dots.tsx` | `ChatLoadingIndicator` while a reply is being prepared | Existing stream status/cancellation remains; muted colors and reduced-motion behavior. |
| Smooth caret input (Skiper106) | [Skiper UI / gxuri Smooth Caret Input](https://skiper-ui.com/v1/skiper106), registry `@skiper-ui/skiper106` | `components/ui/smooth-input.tsx` | Multiline chat composer and diagnostic query input | Adapts measured spring caret to wrapping/newlines, scroll/resize/font changes, native input props and forwarded refs. Native caret during IME, RTL/bidi, reduced motion, touch, and forced colors. Demo DialKit controls removed. |
| Mesh Gradient | [Paper Mesh Gradient](https://shaders.paper.design/mesh-gradient), package `@paper-design/shaders-react` | `components/ui/subtle-mesh-gradient.tsx` | Central research canvas and audio playback | Low-opacity charcoal/brown/copper colors, slow hero motion, audio speed `0.2` while playing / `0.05` paused. Lazy loading, limited pixel budget, WebGL capability detection, and static CSS fallback. |
| Pulsing Border | [Paper Pulsing Border](https://shaders.paper.design/pulsing-border), package `@paper-design/shaders-react` | `components/chat/ChatInputBorder.tsx` | Busy composer while sending or uploading chat images | Thin copper edge, low bloom/intensity, no smoke, static reduced-motion/WebGL fallback. |

## Supporting primitives

| Library | Source | Role |
| --- | --- | --- |
| shadcn CLI | [shadcn/ui](https://ui.shadcn.com/docs/cli) | Source installation and registry mappings in `components.json`; existing utilities/theme retained. |
| Motion | [Motion for React](https://motion.dev/docs/react) | Xevrion spring/layout transitions and Skiper caret springs. |
| Radix Dialog / Tooltip | [Radix primitives](https://www.radix-ui.com/primitives/docs/overview/introduction) | Existing auth, source inspection, diagnostics dialogs, and citation tooltips. |
| Lucide | [Lucide React](https://lucide.dev/guide/packages/lucide-react) | Existing consistent outline icons. |
| react-dropzone | [react-dropzone](https://react-dropzone.js.org/) | Existing document/image file selection and drag-and-drop validation. |

## Installation and local changes

```powershell
npx shadcn@latest add @spectrumui/voice-input @spectrumui/thinking-dots
npx shadcn@latest add https://lab.xevrion.dev/r/select-menu.json https://lab.xevrion.dev/r/hover-card.json https://lab.xevrion.dev/r/upload-button.json
npx shadcn@latest view @skiper-ui/skiper106
```

The upstream source is adapted in this repository, so re-running an add command with overwrite would replace local accessibility, request-state, and theme changes. The Skiper effect uses Motion already required by Xevrion; its demo-only DialKit dependency is unnecessary in the application.

## PLAN.md mapping

- Phase 15.6: internal scrolling stays isolated from Lenis. Hero/audio mesh and the busy composer pulse use the current muted palette. Spectrum Thinking Dots supplies response preparation feedback in place of the earlier LiquidMetal plan.
- Voice UX: the Spectrum control presents the existing MediaRecorder/Web Speech lifecycle, and the seekable playback card retains multipart playback, seek, and speed controls.
- Phase 392–401: diagram generation, its backend endpoint, Heatmap generation loader, and figure actions are still planned. The app currently has no `/api/image/generate` flow; this update does not show a simulated generation action or claim that feature is complete.

Attribution and copied-source licenses are recorded in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
