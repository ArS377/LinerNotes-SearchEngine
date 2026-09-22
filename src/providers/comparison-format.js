import { z } from "zod";

const text = z.string().trim().min(1).max(1200);
const schema = z.object({
  introductions: z.array(z.object({ recordingIndex: z.number().int().nonnegative(), text })).min(2).max(3),
  rows: z.array(z.object({ aspect: text, cells: z.array(text).min(2).max(3) })).min(1).max(5),
  uncertainty: z.string().trim().max(1200).default("")
});


export function parseComparison(answer, recordings) {
  try {
    const raw = JSON.parse(answer);
    const data = schema.parse(raw.introductions ? raw : {
      introductions: recordings.map((_, recordingIndex) => ({ recordingIndex, text: raw[`song${recordingIndex}`] })),
      rows: [
        { aspect: "Musical style", cells: recordings.map((_, index) => raw[`style${index}`]) },
        { aspect: "Production", cells: recordings.map((_, index) => raw[`production${index}`]) }
      ],
      uncertainty: raw.uncertainty
    });
    if (data.introductions.length !== recordings.length ||
        new Set(data.introductions.map((item) => item.recordingIndex)).size !== recordings.length ||
        data.introductions.some((item) => item.recordingIndex >= recordings.length) ||
        data.rows.some((row) => row.cells.length !== recordings.length)) throw new Error();
    return {
      introductions: recordings.map((recording, index) => ({
        title: recording.title, artist: recording.artist,
        text: data.introductions.find((item) => item.recordingIndex === index).text
      })),
      rows: data.rows, uncertainty: data.uncertainty
    };
  } catch {
    throw new Error("The comparison format was incomplete. Please try the comparison again.");
  }
}
