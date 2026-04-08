"use client";

import { Box, Typography, Stack } from "@mui/material";

type CoverageArray = { hour: number; coverage: number }[];

type Props = {
  technicians: CoverageArray;
  supportStaff: CoverageArray;
  radiologists: CoverageArray;
  techTotal: number;
  supportTotal: number;
  radTotal: number;
  onChange: (role: "technicians" | "supportStaff" | "radiologists", index: number, coverage: number) => void;
};

export function StaffingGrid({
  technicians,
  supportStaff,
  radiologists,
  techTotal,
  supportTotal,
  radTotal,
  onChange
}: Props) {
  const hours = Array.from({ length: 24 }, (_, i) => i);

  const getIntensityColor = (coverage: number, colorBase: string) => {
    if (coverage === 0) return "transparent";
    if (coverage < 0.5) return `rgba(${colorBase}, 0.3)`;
    if (coverage < 1) return `rgba(${colorBase}, 0.6)`;
    return `rgb(${colorBase})`;
  };

  const handleClick = (
    role: "technicians" | "supportStaff" | "radiologists",
    index: number,
    currentCoverage: number,
    totalCount: number
  ) => {
    // If we only have 1 staff member, toggle 0 to 1
    if (totalCount <= 1) {
      onChange(role, index, currentCoverage > 0 ? 0 : 1);
      return;
    }
    // If we have > 1, cycle through 0, 0.5, 1
    if (currentCoverage === 0) onChange(role, index, 0.5);
    else if (currentCoverage < 1) onChange(role, index, 1);
    else onChange(role, index, 0);
  };

  return (
    <Box sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "background.paper", overflowX: "auto" }}>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Click to toggle coverage (None &rarr; Partial &rarr; Full). This visually plots when staff are on shift over 24 hours.
      </Typography>

      <Box sx={{ minWidth: 640 }}>
        {/* Header row */}
        <Stack direction="row" spacing={0.5} sx={{ mb: 1, ml: 12 }}>
          {hours.map((h) => (
            <Box key={h} sx={{ flex: 1, textAlign: "center", fontSize: "0.65rem", color: "text.secondary" }}>
              {h}h
            </Box>
          ))}
        </Stack>

        {/* Technicians */}
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, alignItems: "center" }}>
          <Box sx={{ width: 90, flexShrink: 0 }}>
            <Typography variant="caption" fontWeight="bold">Technicians ({techTotal})</Typography>
          </Box>
          {technicians.map((pt, i) => (
            <Box
              key={i}
              onClick={() => handleClick("technicians", i, pt.coverage, techTotal)}
              sx={{
                flex: 1,
                height: 24,
                bgcolor: getIntensityColor(pt.coverage, "37, 99, 235"),
                border: "1px solid",
                borderColor: pt.coverage > 0 ? "rgba(37,99,235,0.2)" : "divider",
                borderRadius: 0.5,
                cursor: "pointer",
                transition: "background-color 0.1s"
              }}
              title={`Hour ${i}: ${Math.round(pt.coverage * techTotal)} on shift`}
            />
          ))}
        </Stack>

        {/* Radiologists */}
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, alignItems: "center" }}>
          <Box sx={{ width: 90, flexShrink: 0 }}>
            <Typography variant="caption" fontWeight="bold">Radiologists ({radTotal})</Typography>
          </Box>
          {radiologists.map((pt, i) => (
            <Box
              key={i}
              onClick={() => handleClick("radiologists", i, pt.coverage, radTotal)}
              sx={{
                flex: 1,
                height: 24,
                bgcolor: getIntensityColor(pt.coverage, "181, 93, 56"),
                border: "1px solid",
                borderColor: pt.coverage > 0 ? "rgba(181,93,56,0.2)" : "divider",
                borderRadius: 0.5,
                cursor: "pointer",
                transition: "background-color 0.1s"
              }}
              title={`Hour ${i}: ${Math.round(pt.coverage * radTotal)} on shift`}
            />
          ))}
        </Stack>

        {/* Support Staff */}
        <Stack direction="row" spacing={0.5} sx={{ mb: 0.5, alignItems: "center" }}>
          <Box sx={{ width: 90, flexShrink: 0 }}>
            <Typography variant="caption" fontWeight="bold">Support ({supportTotal})</Typography>
          </Box>
          {supportStaff.map((pt, i) => (
            <Box
              key={i}
              onClick={() => handleClick("supportStaff", i, pt.coverage, supportTotal)}
              sx={{
                flex: 1,
                height: 24,
                bgcolor: getIntensityColor(pt.coverage, "217, 119, 6"), // amber-600
                border: "1px solid",
                borderColor: pt.coverage > 0 ? "rgba(217,119,6,0.2)" : "divider",
                borderRadius: 0.5,
                cursor: "pointer",
                transition: "background-color 0.1s"
              }}
              title={`Hour ${i}: ${Math.round(pt.coverage * supportTotal)} on shift`}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
