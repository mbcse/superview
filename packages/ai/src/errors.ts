export class ResearchConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchConfigError";
  }
}
