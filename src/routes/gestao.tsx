import { createFileRoute } from "@tanstack/react-router";
import { GestaoPage } from "@/components/gestao";

export const Route = createFileRoute("/gestao")({ component: GestaoPage });
