"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function RunCompareSelector({ baseRunId, otherRuns }: { baseRunId: string, otherRuns: any[] }) {
  const router = useRouter();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  if (otherRuns.length === 0) {
    return null;
  }

  return (
    <>
      <Button 
        variant="outlined" 
        color="secondary"
        onClick={(e) => setAnchorEl(e.currentTarget)}
      >
        Compare
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
      >
        {otherRuns.map((other) => (
          <MenuItem 
            key={other.id} 
            onClick={() => {
              setAnchorEl(null);
              router.push(`/scenarios/compare?base=${baseRunId}&variant=${other.id}`);
            }}
          >
            Run on {new Intl.DateTimeFormat("en", { dateStyle: "short", timeStyle: "short" }).format(new Date(other.startedAt))} (Seed {other.seed})
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
