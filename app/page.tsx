import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Agenda } from "../components/agenda";
import { saoPauloToday } from "../lib/dates";

export default function Page() {
  const changelog = readFileSync(join(process.cwd(), "CHANGELOG.md"), "utf8");
  const releases = changelog.split(/^## /m).slice(1).map((section) => {
    const [title, ...lines] = section.trim().split(/\r?\n/);
    return { title, notes: lines.filter((line) => line.startsWith("- ")).map((line) => line.slice(2)) };
  });
  return <Agenda initialToday={saoPauloToday()} releases={releases} />;
}
