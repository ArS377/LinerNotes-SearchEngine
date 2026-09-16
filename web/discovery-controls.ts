type Choices = { focus: "balanced" | "genre" | "era"; differentArtists: boolean; unfamiliarArtists: boolean };

export function submitDiscoveryChoices(current: Choices, next: Choices, apply: (choices: Choices) => void, retry: () => void) {
  if (current.focus === next.focus && current.differentArtists === next.differentArtists && current.unfamiliarArtists === next.unfamiliarArtists) retry();
  else apply(next);
}
