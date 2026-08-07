import { Permission } from "./models";

export const permissionOptions: { id: Permission; label: string; detail: string }[] = [
  {
    id: "planning.manage",
    label: "Lesson planning",
    detail: "Classes, lessons, templates, schedules, and signage",
  },
  {
    id: "uploads.manage",
    label: "Media uploads",
    detail: "Upload, organize, retain, replace, convert, and delete media",
  },
  {
    id: "playback.control",
    label: "Live playback",
    detail: "Use the cellphone controller and send TV commands",
  },
  {
    id: "screens.manage",
    label: "Screen administration",
    detail: "Rename, assign, tag, configure, and revoke screens",
  },
  {
    id: "users.manage",
    label: "User administration",
    detail: "Create, edit, pause, and delete local accounts",
  },
  {
    id: "app-settings.manage",
    label: "App settings",
    detail:
      "Registration, media taxonomy, pairing PINs, recycling, and activity",
  },
  {
    id: "settings.manage",
    label: "Service settings",
    detail:
      "Email, storage allocation, playback, network, remote access, and server setup",
  },
  {
    id: "backups.manage",
    label: "Privacy, backups, and restore",
    detail: "Create, download, validate, and restore backups",
  },
  {
    id: "updates.manage",
    label: "Software updates",
    detail: "Check for and install LessonCue releases",
  },
];
