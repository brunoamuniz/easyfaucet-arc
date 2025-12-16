"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { ExternalLink, ChevronRight, Pause, Play, Check } from "lucide-react";
import { Project } from "@/lib/config/projects";
import { useToast } from "@/hooks/use-toast";

interface ProjectsShowcaseProps {
  className?: string;
}

const STORAGE_KEY = "arc-showcase-hidden";

/**
 * Shuffles an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function ProjectsShowcase({ className }: ProjectsShowcaseProps) {
  const [isHidden, setIsHidden] = useState(false);
  const [api, setApi] = useState<CarouselApi>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [totalProjectsRegistered, setTotalProjectsRegistered] = useState<number | null>(null);

  // Fetch projects from API
  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/projects");
        const data = await response.json();

        if (data.success && Array.isArray(data.data)) {
          // Randomize the order of projects
          const shuffledProjects = shuffleArray(data.data);
          setProjects(shuffledProjects);
          // Store total projects registered
          if (data.stats?.totalProjectsRegistered) {
            setTotalProjectsRegistered(data.stats.totalProjectsRegistered);
          }
        } else {
          console.error("Failed to fetch projects:", data);
          setProjects([]);
        }
      } catch (error) {
        console.error("Error fetching projects:", error);
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Check localStorage on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hidden = localStorage.getItem(STORAGE_KEY) === "true";
      setIsHidden(hidden);
    }
  }, []);

  // Auto-play carousel: scroll every 5 seconds
  useEffect(() => {
    if (!api || isPaused || projects.length <= 1) return;

    const interval = setInterval(() => {
      if (api.canScrollNext()) {
        api.scrollNext();
      } else {
        // If at the end, go back to the beginning
        api.scrollTo(0);
      }
    }, 5000); // 5 seconds

    return () => clearInterval(interval);
  }, [api, isPaused, projects.length]);

  // Toggle pause/play
  const handleTogglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  // Don't render if no projects (and not loading)
  if (!isLoading && projects.length === 0) {
    return null;
  }

  const handleToggle = () => {
    const newState = !isHidden;
    setIsHidden(newState);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, newState.toString());
    }
  };

  // Show button to restore if hidden
  if (isHidden) {
    return (
      <Button
        onClick={handleToggle}
        className="w-full lg:w-auto"
        style={{
          background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
          color: "#F9FAFB",
          border: "none",
        }}
        aria-label="Show ARC Ecosystem"
      >
        <ChevronRight className="w-4 h-4" />
        <span className="ml-2">Show Projects</span>
      </Button>
    );
  }

  return (
    <section className={className}>
      <Card className="w-full p-6 shadow-2xl" style={{ background: "#050B18", borderColor: "#1E293B" }}>
        <div className="space-y-6">
          {/* Section Header with Hide Button */}
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <a
                href="https://arcindex.xyz"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:opacity-80 transition-opacity inline-block"
              >
                <h2 className="text-2xl font-bold" style={{ color: "#F9FAFB" }}>
                  Arc Index
                </h2>
              </a>
              <p className="text-sm" style={{ color: "#9CA3AF" }}>
                The curated project index for Arc Network
              </p>
              {/* Discreet project count information */}
              {projects.length > 0 && (
                <p className="text-xs opacity-60" style={{ color: "#6B7280" }}>
                  {projects.length} projects available
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                onClick={handleTogglePause}
                className="font-medium text-xs px-3"
                style={{
                  background: isPaused ? "transparent" : "linear-gradient(90deg, #2F2CFF, #C035FF)",
                  color: "#F9FAFB",
                  border: isPaused ? "1px solid #1E293B" : "none",
                }}
                aria-label={isPaused ? "Start carousel" : "Pause carousel"}
              >
                {isPaused ? (
                  <>
                    <Play className="w-3 h-3 mr-1" />
                    Start
                  </>
                ) : (
                  <>
                    <Pause className="w-3 h-3 mr-1" />
                    Pause
                  </>
                )}
              </Button>
              <Button
                onClick={handleToggle}
                className="flex-shrink-0 font-medium"
                style={{
                  background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
                  color: "#F9FAFB",
                  border: "none",
                }}
                aria-label="Hide ARC Ecosystem"
              >
                Close
              </Button>
            </div>
          </div>

          {/* Carousel */}
          <div>
            <Carousel
              opts={{
                align: "start",
                loop: true, // Enable loop to go back to first slide
                slidesToScroll: 1,
              }}
              setApi={setApi}
              className="w-full"
            >
            <CarouselContent className="-ml-2 md:-ml-4">
              {isLoading ? (
                <CarouselItem className="pl-2 md:pl-4 basis-full md:basis-1/2">
                  <Card
                    className="h-full flex items-center justify-center p-8"
                    style={{
                      background: "#050B18",
                      borderColor: "#1E293B",
                    }}
                  >
                    <p className="text-sm" style={{ color: "#9CA3AF" }}>
                      Loading projects...
                    </p>
                  </Card>
                </CarouselItem>
              ) : (
                projects.map((project) => (
                  <CarouselItem key={project.id} className="pl-2 md:pl-4 basis-full md:basis-1/2">
                    <ProjectCard project={project} />
                  </CarouselItem>
                ))
              )}
            </CarouselContent>
            {projects.length > 1 && (
              <>
                <CarouselPrevious
                  className="hidden md:flex -left-4 hover:opacity-80"
                  style={{
                    background: "#1E293B",
                    borderColor: "#1E293B",
                    color: "#F9FAFB",
                  }}
                />
                <CarouselNext
                  className="hidden md:flex -right-4 hover:opacity-80"
                  style={{
                    background: "#1E293B",
                    borderColor: "#1E293B",
                    color: "#F9FAFB",
                  }}
                />
              </>
            )}
          </Carousel>
          </div>

          {/* Submit Project CTA */}
          <div className="text-center pt-2">
            <a
              href="https://arcindex.xyz"
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button
                variant="outline"
                className="text-sm hover:opacity-80 transition-opacity"
                style={{
                  background: "transparent",
                  borderColor: "#1E293B",
                  color: "#9CA3AF",
                }}
              >
                <span className="mr-2">+</span>
                Submit Your Project
              </Button>
            </a>
          </div>
        </div>
      </Card>
    </section>
  );
}

function ProjectCard({ project }: { project: Project }) {
  const [imageError, setImageError] = useState(false);
  const [copiedDiscord, setCopiedDiscord] = useState(false);
  const { toast } = useToast();

  const handleCopyDiscord = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!project.discord) return;

    try {
      await navigator.clipboard.writeText(project.discord);
      setCopiedDiscord(true);
      toast({
        title: "Discord copied!",
        description: `${project.discord} has been copied to clipboard`,
        duration: 2000,
      });
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedDiscord(false);
      }, 2000);
    } catch (error) {
      console.error("Failed to copy Discord:", error);
      toast({
        title: "Failed to copy",
        description: "Could not copy Discord username to clipboard",
        variant: "destructive",
        duration: 2000,
      });
    }
  };

  return (
    <Card
      className="h-full flex flex-col transition-all duration-300 hover:scale-[1.02] hover:shadow-xl cursor-pointer"
      style={{
        background: "#050B18",
        borderColor: "#1E293B",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "#2F2CFF";
        e.currentTarget.style.boxShadow = "0 10px 30px rgba(47, 44, 255, 0.2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "#1E293B";
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <CardHeader className="p-0">
        {/* Project Image */}
        <div className="relative w-full h-40 overflow-hidden rounded-t-lg">
          {!imageError && project.imageUrl ? (
            <img
              src={project.imageUrl}
              alt={project.name}
              className="w-full h-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: "#1E293B" }}
            >
              <div className="text-4xl">🚀</div>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col flex-1 p-4 space-y-2">
        {/* Category Badge */}
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-medium px-2 py-1 rounded-full"
            style={{
              background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
              color: "#F9FAFB",
            }}
          >
            {project.category}
          </span>
        </div>

        {/* Project Name */}
        <CardTitle className="text-lg font-bold" style={{ color: "#F9FAFB" }}>
          {project.name}
        </CardTitle>

        {/* Description */}
        <CardDescription 
          className="text-sm flex-1 line-clamp-2 overflow-hidden" 
          style={{ color: "#9CA3AF" }}
          title={project.description}
        >
          {project.description}
        </CardDescription>

        {/* Social Links - Vertical layout */}
        {(project.twitter || project.discord || project.github || project.contract) && (
          <div className="flex flex-col gap-2 text-xs pt-1">
            {project.twitter && (() => {
              // Extract username from Twitter URL or handle
              let twitterUrl = project.twitter;
              let displayName = project.twitter;
              
              if (twitterUrl.startsWith("http")) {
                // Extract username from URL (e.g., https://x.com/username -> username)
                const match = twitterUrl.match(/(?:x\.com|twitter\.com)\/([^/?]+)/);
                displayName = match ? match[1] : twitterUrl;
              } else {
                // If it's just a handle, use it directly and build URL
                const username = twitterUrl.replace("@", "");
                twitterUrl = `https://x.com/${username}`;
                displayName = username;
              }
              
              return (
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  style={{ color: "#9CA3AF" }}
                >
                  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  <span className="truncate">{displayName}</span>
                </a>
              );
            })()}
            {project.discord && (
              <button
                onClick={handleCopyDiscord}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer text-left"
                style={{ color: "#9CA3AF" }}
                title="Click to copy Discord username"
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515a.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0a12.64 12.64 0 0 0-.617-1.25a.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027A19.9 19.9 0 0 0 .002 17.31a.082.082 0 0 0 .031.057a19.84 19.84 0 0 0 5.993 3.03a.078.078 0 0 0 .084-.028a14.09 14.09 0 0 0 1.226-1.994a.076.076 0 0 0-.041-.106a13.107 13.107 0 0 1-1.872-.892a.077.077 0 0 1-.008-.128a10.2 10.2 0 0 0 .372-.292a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127a12.299 12.299 0 0 1-1.873.892a.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028a19.899 19.899 0 0 0 6.002-3.03a.066.066 0 0 0 .032-.054a19.826 19.826 0 0 0-3.638-12.914a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.956-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419c0-1.333.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42c0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
                <span className="truncate flex items-center gap-1">
                  {project.discord}
                  {copiedDiscord && (
                    <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
                  )}
                </span>
              </button>
            )}
            {project.github && (
              <a
                href={project.github}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{ color: "#9CA3AF" }}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                <span className="truncate">GitHub</span>
              </a>
            )}
            {project.contract && (
              <a
                href={`https://testnet.arcscan.app/address/${project.contract}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                style={{ color: "#9CA3AF" }}
              >
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <span className="truncate font-mono text-[10px]">
                  {project.contract.length > 10 
                    ? `${project.contract.slice(0, 6)}...${project.contract.slice(-4)}`
                    : project.contract}
                </span>
              </a>
            )}
          </div>
        )}

        {/* Visit Project Button */}
        <a
          href={project.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-auto"
        >
          <Button
            className="w-full font-medium"
            style={{
              background: "linear-gradient(90deg, #2F2CFF, #C035FF)",
              color: "#F9FAFB",
              border: "none",
            }}
          >
            <span>Visit Project</span>
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </a>
      </CardContent>
    </Card>
  );
}

