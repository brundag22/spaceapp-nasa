import { useMemo, useState } from 'react';
import { Crosshair, MapPin, Plus, X } from 'lucide-react';
import type { Alert, Marker } from './api';

export const ZONES = [
  { id: 'CRANIAL_OCULAR', label: 'Cranial / ocular', short: 'CRANIAL', x: 50, y: 15 },
  { id: 'THORACIC_CARDIAC', label: 'Thoracic / cardiac', short: 'CARDIAC', x: 50, y: 38 },
  { id: 'PULMONARY', label: 'Pulmonary', short: 'PULMONARY', x: 40, y: 38 },
  { id: 'THORACIC_CHEST', label: 'Thermal / chest', short: 'CHEST', x: 50, y: 46 },
  { id: 'ABDOMEN', label: 'Abdomen', short: 'ABDOMEN', x: 50, y: 56 },
  { id: 'PERIPHERAL_SUIT', label: 'Peripheral / suit', short: 'EVA SUIT', x: 75, y: 73 },
] as const;

interface AnatomyMapProps {
  markers: Marker[];
  alerts?: Alert[];
  onSelect: (zone: typeof ZONES[number]) => void;
  canEdit?: boolean;
  compact?: boolean;
}

export function AnatomyMap({ markers, alerts = [], onSelect, canEdit = true, compact = false }: AnatomyMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const activeByZone = useMemo(() => {
    const active = new Map<string, Marker[]>();
    for (const marker of markers.filter((item) => !item.resolved)) {
      const current = active.get(marker.bodyZone) ?? [];
      current.push(marker);
      active.set(marker.bodyZone, current);
    }
    return active;
  }, [markers]);
  const activeAlertsByZone = useMemo(() => {
    const active = new Map<string, Alert[]>();
    for (const alert of alerts.filter((item) => item.status !== 'RESOLVED')) {
      const current = active.get(alert.bodyZone) ?? [];
      current.push(alert);
      active.set(alert.bodyZone, current);
    }
    return active;
  }, [alerts]);

  function zoneNode(zoneId: string) {
    const zone = ZONES.find((item) => item.id === zoneId)!;
    const active = activeByZone.get(zone.id) ?? [];
    const zoneAlerts = activeAlertsByZone.get(zone.id) ?? [];
    const hasFinding = active.length > 0 || zoneAlerts.length > 0;
    const critical = active.some((marker) => marker.severity === 'RED' || marker.severity === 'ORANGE')
      || zoneAlerts.some((alert) => alert.severity === 'RED' || alert.severity === 'ORANGE');
    const color = critical ? 'var(--danger)' : hasFinding ? 'var(--warning)' : 'var(--brand)';
    return (
      <g key={zone.id} className={`anatomy-zone ${hovered === zone.id ? 'is-hovered' : ''} ${active.length ? 'has-marker' : ''} ${zoneAlerts.length ? 'has-alert' : ''}`} onClick={() => { if (canEdit) onSelect(zone); }} onMouseEnter={() => setHovered(zone.id)} onMouseLeave={() => setHovered(null)} role={canEdit ? 'button' : undefined} tabIndex={canEdit ? 0 : -1} aria-label={`${canEdit ? 'Add clinical marker' : 'Review health zone'}: ${zone.label}`} onKeyDown={(event) => { if (canEdit && (event.key === 'Enter' || event.key === ' ')) onSelect(zone); }}>
        <circle className="zone-hit" cx={zone.x} cy={zone.y} r="8" />
        <circle className="zone-focus" cx={zone.x} cy={zone.y} r="5.1" style={{ stroke: color }} />
        <circle className="zone-dot" cx={zone.x} cy={zone.y} r={hasFinding ? '2.35' : '1.25'} style={{ fill: color }} />
        {hasFinding && <g className="map-marker-pulse"><circle cx={zone.x} cy={zone.y} r="3.6" style={{ stroke: color }} /><text x={zone.x + 5} y={zone.y - 4}>{active.length + zoneAlerts.length}</text></g>}
        <text className="zone-label" x={zone.x + (zone.id === 'PULMONARY' ? -8 : 6)} y={zone.y - 5} textAnchor={zone.id === 'PULMONARY' ? 'end' : 'start'}>{zone.short}</text>
      </g>
    );
  }

  return (
    <div className={`anatomy-map-wrap ${compact ? 'compact' : ''}`}>
      <div className="map-axis-label axis-top">ANTERIOR VIEW <span>HUMAN ZONE MAP</span></div>
      <svg className="anatomy-svg" viewBox="0 0 100 100" role="img" aria-label="Interactive astronaut anatomy zone map">
        <defs>
          <linearGradient id="bodyLine" x1="0" x2="0.85" y1="0" y2="1"><stop offset="0" stopColor="var(--brand)" stopOpacity="0.93"/><stop offset="1" stopColor="var(--line-soft)" stopOpacity="0.55"/></linearGradient>
          <radialGradient id="bodyFill"><stop offset="0" stopColor="var(--brand)" stopOpacity="0.14"/><stop offset="1" stopColor="var(--brand)" stopOpacity="0.01"/></radialGradient>
        </defs>
        <g className="wire-body" fill="none" stroke="url(#bodyLine)" strokeWidth="0.45" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="50" cy="12.2" r="6.8" fill="url(#bodyFill)" />
          <path d="M45.4 18.4 43 21.8 40 23.2M54.6 18.4l2.4 3.4 3 1.4" />
          <path d="M50 19v5M42.3 22.2c-2.6 1.1-4 3.5-4 6.1v23.3c0 3.5 1.9 5.5 4.4 6.3l1 12.2-2.2 18.2c-.2 2.1 2.9 2.3 3.5.6l4.8-15.5 4.7 15.5c.6 1.7 3.7 1.5 3.5-.6l-2.1-18.2 1-12.2c2.5-.8 4.3-2.8 4.3-6.3V28.3c0-2.6-1.4-5-4-6.1l-6.2 2.3-6.2-2.3Z" fill="url(#bodyFill)" />
          <path d="m38.4 28.6-7.2 15.5c-1.7 3.6 2.1 5.8 4 2.5l7.1-11.8M61.6 28.6l7.2 15.5c1.7 3.6-2.1 5.8-4 2.5l-7.1-11.8" />
          <path d="M44.2 34.5h11.6M44 47.8h12M45.2 58h9.6M44.4 66.4h11.2M43.3 81.1l-3.1 7.8c-.7 1.5.6 2.2 1.9 1.2l5.8-5.9M56.7 81.1l3.1 7.8c.7 1.5-.6 2.2-1.9 1.2l-5.8-5.9" />
          <path d="M46.3 26.2c-1.6 2.1-2.4 4.4-2.5 7.3M53.7 26.2c1.6 2.1 2.4 4.4 2.5 7.3M47 42.8v4M53 42.8v4M47 53v5M53 53v5" strokeDasharray="1.1 1.2" />
        </g>
        {zoneNode('CRANIAL_OCULAR')}{zoneNode('THORACIC_CARDIAC')}{zoneNode('PULMONARY')}{zoneNode('THORACIC_CHEST')}{zoneNode('ABDOMEN')}{zoneNode('PERIPHERAL_SUIT')}
        {markers.filter((marker) => !marker.resolved).map((marker) => {
          const zone = ZONES.find((item) => item.id === marker.bodyZone);
          const x = zone ? zone.x : marker.coordX;
          const y = zone ? zone.y : marker.coordY;
          return <g key={marker.id} className={`saved-marker marker-${marker.severity.toLowerCase()}`} transform={`translate(${x} ${y})`}><circle r="2.6" /><path d="M-1.6 0h3.2M0-1.6v3.2" /></g>;
        })}
      </svg>
      <div className="map-axis-label axis-bottom"><span><i className="map-key teal" /> NOMINAL</span><span><i className="map-key amber" /> REVIEW</span><span><i className="map-key red" /> PRIORITY</span></div>
    </div>
  );
}
