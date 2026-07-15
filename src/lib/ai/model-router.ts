export type UserPlan = "free" | "standard" | "pro";

export function resolveAdvisorModel(userPlan: UserPlan): string {
  switch (userPlan) {
    case "pro":
      return "gpt-4o";
    case "standard":
    case "free":
    default:
      return "gpt-4o-mini";
  }
}
