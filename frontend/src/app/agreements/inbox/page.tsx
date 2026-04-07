// Redirect to the Requests page (same feature, canonical URL)
import { redirect } from "next/navigation";
export default function InboxRedirect() {
  redirect("/agreements/requests");
}
