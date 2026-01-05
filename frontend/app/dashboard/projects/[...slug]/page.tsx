// frontend/app/dashboard/projects/[...slug]/page.tsx
// Server component wrapper for project detail - catch-all route

import ProjectDetailClient from './ProjectDetailClient';

// Required for static export with dynamic routes
// This generates /dashboard/projects/placeholder/index.html
export async function generateStaticParams() {
  return [
    { slug: ['placeholder'] }
  ];
}

// This is needed for static export
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ slug: string[] }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { slug } = await params;
  return <ProjectDetailClient />;
}
