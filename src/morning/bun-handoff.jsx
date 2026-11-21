import React from 'react';
import { createRoot } from 'react-dom/client';
import { Card } from 'animal-island-ui/es/components/Card/Card.js';
import { Tag } from 'animal-island-ui/es/components/Tag/Tag.js';

export function mountBunHandoff(container, { staff, line }) {
  createRoot(container).render(
    <Card className="bun-dialogue-card" pattern="default">
      <Tag color="app-teal" variant="soft">{staff}</Tag>
      <p>{line}</p>
    </Card>
  );
}
