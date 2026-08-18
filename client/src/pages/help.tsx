import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";

export default function Help() {
  const [, setLocation] = useLocation();
  const [content, setContent] = useState<string>("Loading help...");

  useEffect(() => {
    let active = true;
    fetch('/help/flowscanner.md')
      .then((r) => r.text())
      .then((t) => {
        if (!active) return;
        setContent(t);
      })
      .catch(() => setContent('Failed to load help content.'));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Help</h1>
        <Button variant="ghost" onClick={() => setLocation('/')}>Close</Button>
      </div>
      <pre className="whitespace-pre-wrap bg-card p-4 rounded">{content}</pre>
    </div>
  );
}
