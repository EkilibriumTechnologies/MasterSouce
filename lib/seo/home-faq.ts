/** Homepage FAQ copy — kept in one module so UI and JSON-LD stay aligned. */
export type HomeFaqItem = { question: string; answer: string };

export const HOME_FAQ_ITEMS: HomeFaqItem[] = [
  {
    question: "What is MasterSauce?",
    answer:
      "An in-browser mastering tool: upload your mix, choose genre and loudness, run a short analysis, then A/B the recommended master (or optional adaptive customization on paid plans). When you like what you hear, export the full-resolution WAV."
  },
  {
    question: "Who is MasterSauce for?",
    answer:
      "Independent artists, bedroom producers, and people using AI music tools who need a consistent, release-ready level — without booking a studio or spending hours tweaking limiters and EQs by hand."
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
  },
  {
    question: "What counts toward my plan?",
    answer:
      "Unlimited previews and A/B playback. Only each finished, full-quality export counts toward your monthly allowance (two on Free). Paid plans raise that cap; credit packs add five extra exports whenever you need them."
  }
];
