/** Homepage FAQ copy — kept in one module so UI and JSON-LD stay aligned. */
export type HomeFaqItem = { question: string; answer: string };

export const HOME_FAQ_ITEMS: HomeFaqItem[] = [
  {
    question: "Will this crush my dynamics?",
    answer:
      "No. MasterSauce targets streaming loudness norms (Spotify, Apple Music, YouTube) which are actually moderate. The engine preserves punch and dynamics — it's not a brick wall limiter. If your mix is already well-balanced, the master will feel louder and cleaner, not squashed."
  },
  {
    question: "What if my mix isn't perfect?",
    answer:
      "That's exactly who this is built for. You don't need a perfect mix to get value from mastering — the engine adapts to your genre and loudness preset. A/B the result before you commit. If it doesn't lift the track, don't export."
  },
  {
    question: "Is this just for AI music?",
    answer:
      "No. MasterSauce works for any mix — bedroom recordings, live instruments, full band productions, or AI-generated tracks. The genre presets cover Pop, Hip-Hop, EDM, Rock, Reggaeton, R&B, and Lo-Fi."
  },
  {
    question: "Can I hear the result before paying anything?",
    answer:
      "Yes. Upload your mix, run the analysis, and A/B preview as many times as you want — completely free. You only use your export allowance when you download the final master."
  },
  {
    question: "Do I lose rights to my song?",
    answer:
      "Never. You retain 100% ownership. MasterSauce processes your file to generate previews and your export, then it's gone. We are a tool, not a rights holder."
  },
  {
    question: "What's the difference between the free plan and paid?",
    answer:
      "Free gives you unlimited MP3 master downloads and 1 WAV download per month at 16-bit — enough to test the workflow. Creator ($9/mo) adds 15 WAV downloads/month, 24-bit WAV, and adaptive customization. Pro Studio ($24/mo) goes up to 60 WAV downloads/month and 32-bit float for batch work."
  },
  {
    question: "What is MasterSauce?",
    answer:
      "An in-browser mastering tool: upload your mix, choose genre and loudness, run a short analysis, then A/B the recommended master (or optional adaptive customization on paid plans). When you like what you hear, export the full-resolution WAV."
  },
  {
    question: "Do you keep my audio?",
    answer:
      "Files are processed to build previews and your export; we do not treat uploads as a personal music library. Retention details are in the Privacy Policy if you need the fine print."
  },
  {
    question: "What can I upload?",
    answer:
      "WAV or MP3 within the limit shown in the uploader. A quick analysis checks loudness and headroom, then mastering follows the genre and loudness preset you selected."
  }
];
