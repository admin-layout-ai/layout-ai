// frontend/app/dashboard/projects/[...slug]/page.tsx
// Server component wrapper - handles static params generation

import ProjectDetailClient from './ProjectDetailClient';

// Required for static export with dynamic routes
export function generateStaticParams() {
  return [{ slug: ['placeholder'] }];
}

export default function ProjectDetailPage() {
  return <ProjectDetailClient />;
}
