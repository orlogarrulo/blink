import { createFileRoute } from "@tanstack/react-router";
import { BlinkApp } from "@/components/blink-app";

export const Route = createFileRoute("/")({ component: BlinkApp });
