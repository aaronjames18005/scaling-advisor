import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useQuery } from "convex/react";
import { motion } from "framer-motion";
import { 
  Plus, 
  Rocket, 
  BarChart3, 
  Clock, 
  CheckCircle2, 
  ArrowRight,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router";
import { useEffect, useState } from "react";

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const projects = useQuery(api.projects.list);

  const [navCreatingTop, setNavCreatingTop] = useState(false);
  const [navCreatingSection, setNavCreatingSection] = useState(false);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate("/auth");
    }
  }, [authLoading, isAuthenticated, navigate]);

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-lg text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  const activeProjects = projects?.filter(p => p.status === "active") || [];
  const completedProjects = projects?.filter(p => p.status === "completed") || [];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap md:flex-nowrap justify-between items-center gap-3 h-auto md:h-16 py-3 md:py-0">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                <Rocket className="h-5 w-5 text-background" />
              </div>
              <span className="text-xl font-bold tracking-tight">ScaleAdvisor</span>
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
              <span className="hidden md:inline text-sm text-muted-foreground">
                Welcome back, {user?.name || "Developer"}
              </span>
              {/* Desktop/Tablet CTA */}
              <Button
                onClick={() => {
                  setNavCreatingTop(true);
                  navigate("/projects/new");
                }}
                className="glow-primary hidden md:inline-flex"
                disabled={navCreatingTop}
              >
                {navCreatingTop ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Opening...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    New Project
                  </>
                )}
              </Button>
              {/* Mobile CTA (icon only) */}
              <Button
                onClick={() => {
                  setNavCreatingTop(true);
                  navigate("/projects/new");
                }}
                size="icon"
                className="glow-primary md:hidden"
                disabled={navCreatingTop}
              >
                {navCreatingTop ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8 p-6 rounded-xl gradient-primary glow-primary"
        >
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            Your Scaling Dashboard
          </h1>
          <p className="text-xl text-muted-foreground">
            Manage your projects and track your scaling progress
          </p>
        </motion.div>

        {/* Stats Cards */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8"
        >
          <Card className="glass gradient-primary glow-primary">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
              <BarChart3 className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{activeProjects.length}</div>
              <p className="text-xs text-muted-foreground">
                Currently scaling
              </p>
            </CardContent>
          </Card>

          <Card className="glass gradient-accent glow-accent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-accent" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{completedProjects.length}</div>
              <p className="text-xs text-muted-foreground">
                Successfully scaled
              </p>
            </CardContent>
          </Card>

          <Card className="glass gradient-primary glow-ring">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Projects</CardTitle>
              <Clock className="h-4 w-4 text-ring" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{projects?.length || 0}</div>
              <p className="text-xs text-muted-foreground">
                All time
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Projects Section */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl p-6 gradient-accent"
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Your Projects</h2>
            <Button
              onClick={() => {
                setNavCreatingSection(true);
                navigate("/projects/new");
              }}
              variant="outline"
              disabled={navCreatingSection}
            >
              {navCreatingSection ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Opening...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Project
                </>
              )}
            </Button>
          </div>

          {projects !== undefined && projects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {projects.map((project, index) => (
                <motion.div
                  key={project._id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.1 * index }}
                >
                  <Card className="glass hover:glow-primary transition-all duration-300 group cursor-pointer h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-lg group-hover:text-primary transition-colors">
                            {project.name}
                          </CardTitle>
                          <CardDescription className="mt-1">
                            {project.description || "No description"}
                          </CardDescription>
                        </div>
                        <div className={`px-2 py-1 rounded-md text-xs font-medium ${
                          project.status === "active" 
                            ? "bg-primary/10 text-primary" 
                            : project.status === "completed"
                            ? "bg-accent/10 text-accent"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {project.status}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Tech Stack:</span>
                          <span className="font-medium capitalize">{project.techStack}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Phase:</span>
                          <span className="font-medium capitalize">
                            {project.currentPhase} → {project.targetPhase}
                          </span>
                        </div>
                        <Button 
                          className="w-full mt-4 group-hover:glow-primary"
                          onClick={() => {
                            setViewingProjectId(project._id);
                            navigate(`/projects/${project._id}`);
                          }}
                          disabled={viewingProjectId === project._id}
                        >
                          {viewingProjectId === project._id ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Opening...
                            </>
                          ) : (
                            <>
                              View Project
                              <ArrowRight className="ml-2 h-4 w-4" />
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}