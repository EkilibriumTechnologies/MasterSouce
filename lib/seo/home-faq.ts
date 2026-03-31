/** Homepage FAQ copy — kept in one module so UI and JSON-LD stay aligned. */
export type HomeFaqItem = { question: string; answer: string };

export const HOME_FAQ_ITEMS: HomeFaqItem[] = [
  {
    question: "What is MasterSauce?",
    answer:
      "MasterSauce is a web app that masters your mixes automatically: you upload a track, pick genre and loudness, listen to a before/after preview, then unlock the full WAV when you are ready. It is built for finishing music quickly without a complex mastering chain."
  },
  {
    question: "Who is MasterSauce for?",
    answer:
      "Independent artists, bedroom producers, AI music creators, and anyone shipping demos, singles, or content who wants a cleaner, louder, more balanced master without booking a studio or wrestling with plugins for hours."
  },
  {
    question: "Do you keep my audio?",
    answer:
      "Your files are processed to generate previews and the final master; they are not kept as a personal media library. See our Privacy Policy for how long technical processing may retain data and how to reach us with questions."
  },
  {
    question: "What can I upload?",
    answer:
      "You can upload common formats such as WAV or MP3 within the size limits shown in the uploader. The tool analyzes your track and applies mastering tailored to the options you choose."
  },
  {
    question: "What counts toward my plan?",
    answer:
      "You can preview as much as you like. Only final mastered exports count toward your monthly masters; upgrading or credit packs is available if you need more downloads."
  }
];
