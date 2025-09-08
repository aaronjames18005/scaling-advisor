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
import { useMutation } from "convex/react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import InfraCanvas from "@/components/InfraCanvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";

export default function Dashboard() {
  const { isLoading: authLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const projects = useQuery(api.projects.list);
  const removeProject = useMutation(api.projects.remove);
  const runSecurityAdvisor = useMutation(api.security.generateForProject);
  const generateConfig = useMutation(api.configurations.generate);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteText, setConfirmDeleteText] = useState<string>("");

  const [navCreatingTop, setNavCreatingTop] = useState(false);
  const [navCreatingSection, setNavCreatingSection] = useState(false);
  const [viewingProjectId, setViewingProjectId] = useState<string | null>(null);
  const [securityProjectId, setSecurityProjectId] = useState<string | null>(null);
  const [runningSecurityId, setRunningSecurityId] = useState<string | null>(null);
  const [canvasProjectId, setCanvasProjectId] = useState<string | null>(null);
  const [generatingType, setGeneratingType] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Load configurations for the currently viewed project (modal)
  const configs = useQuery(
    api.configurations.listByProject,
    viewingProjectId ? ({ projectId: viewingProjectId as any } as any) : "skip"
  );

  const compliance = useQuery(
    api.security.listComplianceByProject,
    securityProjectId ? { projectId: securityProjectId as any } : "skip"
  );

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

  const filteredProjects = (projects || []).filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (p.name || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.techStack || "").toLowerCase().includes(q) ||
      (p.status || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/90 backdrop-blur-md backdrop-saturate-150 shadow-lg ring-1 ring-border/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap md:flex-nowrap justify-between items-center gap-3 h-auto md:h-16 py-3 md:py-0">
            <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
              <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center shadow-md">
                <Rocket className="h-5 w-5 text-background" />
              </div>
              <span className="text-xl font-bold tracking-tight">ScaleAdvisor</span>
            </div>
            
            <div className="flex items-center gap-3 ml-auto">
              <span className="hidden md:inline text-sm text-muted-foreground">
                Welcome back, {user?.name || "Developer"}
              </span>
              {/* Mobile menu (sheet) */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="md:hidden"
                    aria-label="Open menu"
                  >
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[85vw] sm:w-80">
                  <div className="flex flex-col gap-3 mt-6">
                    <div className="text-sm text-muted-foreground">
                      {user?.name ? `Signed in as ${user.name}` : "Signed in"}
                    </div>
                    <Button
                      className="glow-primary"
                      onClick={() => {
                        setNavCreatingTop(true);
                        navigate("/projects/new");
                      }}
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
                    <Button
                      variant="outline"
                      onClick={() => navigate("/")}
                    >
                      Home
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => navigate("/dashboard")}
                    >
                      Dashboard
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
          {/* Accent bar for visibility */}
          <div className="h-1 bg-gradient-to-r from-primary via-accent to-primary/90 opacity-90" />
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-28">
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
          {/* Header: responsive layout */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <h2 className="text-2xl font-bold tracking-tight">Your Projects</h2>
            <div className="flex w-full sm:w-auto items-center gap-2">
              <Input
                placeholder="Search projects..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full sm:w-[240px]"
              />
              <Button
                onClick={() => {
                  setNavCreatingSection(true);
                  navigate("/projects/new");
                }}
                className="hidden"
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
                    New Project
                  </>
                )}
              </Button>
            </div>
          </div>

          {filteredProjects !== undefined && filteredProjects.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProjects.map((project, index) => (
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

                        {/* Actions */}
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Dialog
                            open={viewingProjectId === project._id}
                            onOpenChange={(open) => {
                              if (!open) setViewingProjectId(null);
                              else setViewingProjectId(project._id);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                className="flex-1 group-hover:glow-primary"
                                onClick={() => setViewingProjectId(project._id)}
                              >
                                <>
                                  View Project
                                  <ArrowRight className="ml-2 h-4 w-4" />
                                </>
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto glass gradient-primary/30 glow-primary border-border/60 rounded-xl shadow-xl
                              data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
                              data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200">
                              <DialogHeader>
                                <DialogTitle className="text-xl">Project Details</DialogTitle>
                                <DialogDescription className="text-muted-foreground">
                                  View project information and manage generated configurations.
                                </DialogDescription>
                              </DialogHeader>

                              <Tabs defaultValue="overview" className="mt-2 animate-in fade-in-0">
                                <TabsList className="shadow-inner border rounded-lg p-1 bg-background/70 backdrop-blur overflow-x-auto whitespace-nowrap">
                                  <TabsTrigger className="px-3 py-1.5" value="overview">Overview</TabsTrigger>
                                  <TabsTrigger className="px-3 py-1.5" value="configs">Configurations</TabsTrigger>
                                </TabsList>

                                <TabsContent value="overview" className="mt-4">
                                  <div className="space-y-3 bg-card/60 border rounded-md p-4">
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Name</span>
                                      <span className="font-medium">{project.name}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Status</span>
                                      <span className="font-medium capitalize">{project.status}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Tech Stack</span>
                                      <span className="font-medium capitalize">{project.techStack}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-sm">
                                      <span className="text-muted-foreground">Phase</span>
                                      <span className="font-medium capitalize">
                                        {project.currentPhase} → {project.targetPhase}
                                      </span>
                                    </div>
                                    <div className="text-sm">
                                      <div className="text-muted-foreground mb-1">Description</div>
                                      <div className="rounded-md border bg-background p-3">
                                        {project.description || "No description provided."}
                                      </div>
                                    </div>
                                  </div>
                                </TabsContent>

                                <TabsContent value="configs" className="mt-4">
                                  <div className="space-y-4">
                                    <div className="flex flex-wrap gap-2 bg-card/60 border rounded-md p-3">
                                      {[
                                        "dockerfile",
                                        "kubernetes",
                                        "terraform",
                                        "github-actions",
                                        "docker-compose",
                                      ].map((type) => (
                                        <Button
                                          key={type}
                                          variant="outline"
                                          onClick={async () => {
                                            try {
                                              setGeneratingType(type);
                                              await generateConfig({
                                                projectId: project._id as any,
                                                type: type as any,
                                              });
                                              toast.success(`Generated ${type} configuration`);
                                            } catch (e) {
                                              console.error("generate configuration error", e);
                                              toast.error(`Failed to generate ${type}`);
                                            } finally {
                                              setGeneratingType(null);
                                            }
                                          }}
                                          loading={generatingType === type}
                                          disabled={generatingType !== null && generatingType !== type}
                                        >
                                          Generate {type}
                                        </Button>
                                      ))}
                                    </div>

                                    <div className="space-y-3 max-h-[55vh] overflow-auto pr-1">
                                      {configs === undefined ? (
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                          Loading configurations...
                                        </div>
                                      ) : configs.length === 0 ? (
                                        <p className="text-sm text-muted-foreground">
                                          No configurations yet. Generate one above.
                                        </p>
                                      ) : (
                                        configs.map((c: any) => (
                                          <div
                                            key={c._id}
                                            className="rounded-md border bg-card/60 p-3 space-y-2"
                                          >
                                            <div className="flex items-center justify-between">
                                              <div className="space-y-0.5">
                                                <div className="font-semibold">{c.name}</div>
                                                <div className="text-xs text-muted-foreground">
                                                  {c.type} • {c.description}
                                                </div>
                                              </div>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                  try {
                                                    await navigator.clipboard.writeText(c.content || "");
                                                    toast.success("Configuration copied to clipboard");
                                                  } catch {
                                                    toast.error("Failed to copy");
                                                  }
                                                }}
                                              >
                                                Copy
                                              </Button>
                                            </div>
                                            <details className="group">
                                              <summary className="cursor-pointer text-sm text-primary hover:underline">
                                                View content
                                              </summary>
                                              <pre className="mt-2 max-h-72 overflow-auto rounded-md border bg-background p-3 text-xs">
                                                {c.content}
                                              </pre>
                                            </details>
                                          </div>
                                        ))
                                      )}
                                    </div>
                                  </div>
                                </TabsContent>
                              </Tabs>
                            </DialogContent>
                          </Dialog>

                          {/* Security Advisor trigger */}
                          <Dialog
                            open={securityProjectId === project._id}
                            onOpenChange={(open) => {
                              if (!open) setSecurityProjectId(null);
                              else setSecurityProjectId(project._id);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                size="icon"
                                aria-label="Security Advisor"
                                onClick={() => setSecurityProjectId(project._id)}
                                disabled={runningSecurityId === project._id}
                                className="h-10 w-10"
                              >
                                {runningSecurityId === project._id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Shield className="h-4 w-4" />
                                )}
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl glass gradient-primary/20 glow-primary border-border/60 rounded-xl shadow-xl
                              data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
                              data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200">
                              <DialogHeader>
                                <DialogTitle>Security Advisor</DialogTitle>
                                <DialogDescription>
                                  Generate security artifacts and review CIS-based checks.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="flex items-center gap-2">
                                <Button
                                  onClick={async () => {
                                    try {
                                      setRunningSecurityId(project._id);
                                      await runSecurityAdvisor({ projectId: project._id });
                                      toast.success("Security artifacts generated and checks refreshed");
                                    } catch (e) {
                                      console.error("security.generate error", e);
                                      toast.error("Failed to run Security Advisor");
                                    } finally {
                                      setRunningSecurityId(null);
                                    }
                                  }}
                                  disabled={runningSecurityId === project._id}
                                  className="glow-primary"
                                >
                                  {runningSecurityId === project._id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Running...
                                    </>
                                  ) : (
                                    <>
                                      <Shield className="mr-2 h-4 w-4" />
                                      Run Advisor
                                    </>
                                  )}
                                </Button>
                                <span className="text-xs text-muted-foreground">
                                  Creates CIS-aligned Terraform snippets, IAM least-privilege scaffold, and a secrets policy.
                                </span>
                              </div>
                              <div className="mt-4 space-y-3">
                                <h4 className="font-semibold">Compliance Checks</h4>
                                {compliance === undefined ? (
                                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Loading checks...
                                  </div>
                                ) : compliance.length === 0 ? (
                                  <p className="text-sm text-muted-foreground">
                                    No checks yet. Run the advisor to generate them.
                                  </p>
                                ) : (
                                  <div className="space-y-2 max-h-80 overflow-auto pr-1">
                                    {compliance.map((c: any) => (
                                      <div
                                        key={c._id}
                                        className="rounded-md border p-3 bg-card/60 flex flex-col gap-1"
                                      >
                                        <div className="flex items-center justify-between">
                                          <span className="font-medium">{c.title}</span>
                                          <span className={`text-xs px-2 py-0.5 rounded ${
                                            c.severity === "high"
                                              ? "bg-destructive/10 text-destructive"
                                              : c.severity === "medium"
                                              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                                              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                          }`}>
                                            {c.severity}
                                          </span>
                                        </div>
                                        <p className="text-sm text-muted-foreground">{c.description}</p>
                                        <div className="flex items-center gap-2 text-xs">
                                          <span className="rounded bg-primary/10 text-primary px-2 py-0.5">
                                            {c.category}
                                          </span>
                                          <span className="rounded bg-accent/10 text-accent px-2 py-0.5">
                                            {c.standard}
                                          </span>
                                        </div>
                                        <div className="text-xs text-muted-foreground">
                                          Remediation: {c.remediation}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </DialogContent>
                          </Dialog>

                          {/* Infra Canvas trigger */}
                          <Dialog
                            open={canvasProjectId === project._id}
                            onOpenChange={(open) => {
                              if (!open) setCanvasProjectId(null);
                              else setCanvasProjectId(project._id);
                            }}
                          >
                            <DialogTrigger asChild>
                              <Button
                                variant="outline"
                                onClick={() => setCanvasProjectId(project._id)}
                              >
                                Infra Canvas
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="w-[95vw] sm:w-auto max-w-4xl max-h-[85vh] overflow-y-auto glass gradient-accent/20 glow-primary border-border/60 rounded-xl shadow-xl
                              data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95
                              data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200">
                              <DialogHeader>
                                <DialogTitle>Interactive Infra Canvas</DialogTitle>
                                <DialogDescription>
                                  Drag nodes (DB, LB, API) and generate Terraform/K8s config.
                                </DialogDescription>
                              </DialogHeader>
                              <InfraCanvas
                                projectId={project._id as any}
                                projectName={project.name}
                                onGenerated={() => {
                                  // keep dialog open; user can close manually
                                }}
                              />
                            </DialogContent>
                          </Dialog>

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                className="shrink-0 h-10 w-10"
                                aria-label="Delete project"
                                onClick={() => setConfirmDeleteText("")}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this project?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently remove "{project.name}". This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>

                              <div className="space-y-2">
                                <Label htmlFor={`confirm-${project._id}`} className="text-sm">
                                  Type <span className="font-semibold">DELETE</span> to confirm
                                </Label>
                                <Input
                                  id={`confirm-${project._id}`}
                                  placeholder="DELETE"
                                  value={confirmDeleteText}
                                  onChange={(e) => setConfirmDeleteText(e.target.value)}
                                  autoComplete="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                  This extra confirmation helps prevent accidental deletions.
                                </p>
                              </div>

                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={async () => {
                                    try {
                                      setDeletingId(project._id);
                                      await removeProject({ id: project._id });
                                      toast.success("Project deleted");
                                    } catch (err) {
                                      console.error("Delete project error", err);
                                      toast.error("Failed to delete project");
                                    } finally {
                                      setDeletingId(null);
                                      setConfirmDeleteText("");
                                    }
                                  }}
                                  disabled={
                                    deletingId === project._id ||
                                    confirmDeleteText.trim().toUpperCase() !== "DELETE"
                                  }
                                >
                                  {deletingId === project._id ? (
                                    <>
                                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                      Deleting...
                                    </>
                                  ) : (
                                    "Delete"
                                  )}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Floating New Project Button (visible on all screens) */}
      <div className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 md:bottom-8 md:right-8 z-50">
        <Button
          className="glow-primary shadow-2xl h-14 w-14 rounded-xl"
          size="icon"
          aria-label="Create a new project"
          onClick={() => {
            setNavCreatingSection(true);
            navigate("/projects/new");
          }}
          disabled={navCreatingSection}
        >
          {navCreatingSection ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Plus className="h-7 w-7" />
          )}
        </Button>
      </div>
    </div>
  );
}