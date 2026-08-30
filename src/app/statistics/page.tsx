import type { Metadata } from "next";
import StatisticsPage from "@/components/StatisticsPage";

export const metadata: Metadata = {
    title: "Statistiques — Fresh Music",
};

export default function Statistics() {
    return <StatisticsPage />;
}
