"use client";

import { useState } from "react";

export interface ShareButtonsProps {
  datasetName: string;
  providerName: string;
  datasetUrl: string;
  pricePerQuery: string;
}

/**
 * Social share buttons for dataset pages. Pre-populates platform-specific
 * share text — no backend required, pure client-side links.
 */
export function ShareButtons({ datasetName, providerName, datasetUrl, pricePerQuery }: ShareButtonsProps) {
  const shareText = `${providerName} just listed "${datasetName}" on Pacific Data Commons. Query Pacific data for ${pricePerQuery} → ${datasetUrl}`;

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(datasetUrl)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent(`Pacific Data Available: ${datasetName}`)}&body=${encodeURIComponent(shareText)}`;

  return (
    <div className="flex flex-wrap gap-3 items-center">
      <span className="text-sm text-gray-500">Share:</span>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
        X / Twitter
      </a>
      <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
        LinkedIn
      </a>
      <a href={emailUrl} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
        Email
      </a>
      <CopyLinkButton url={datasetUrl} />
    </div>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => undefined);
  };

  return (
    <button type="button" onClick={handleCopy} className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
      {copied ? "Copied!" : "Copy link"}
    </button>
  );
}
