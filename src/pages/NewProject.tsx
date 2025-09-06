import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import { useMutation } from "convex/react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Rocket, Sparkles, TrendingUp, Zap, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

export default function NewProject() {
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const createProject = useMutation(api.projects.create);
  
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    techStack: "",
    currentPhase: "",
    targetPhase: "",
    currentInfra: "",
    scalingGoals: [] as string[],
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.techStack || !formData.currentPhase || !formData.targetPhase) {
      toast.error("Please fill in all required fields");
      return;
    }

    setIsLoading(true);
    
    try {
      const projectId = await createProject({
        name: formData.name,
        description: formData.description || undefined,
        techStack: formData.techStack as any,
        currentPhase: formData.currentPhase as any,
        targetPhase: formData.targetPhase as any,
        currentInfra: formData.currentInfra,
        scalingGoals: formData.scalingGoals.filter(goal => goal.trim() !== ""),
      });

      toast.success("Project created successfully!");
      navigate(`/projects/${projectId}`);
    } catch (error) {
      console.error("Error creating project:", error);
      toast.error("Failed to create project. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const addScalingGoal = () => {
    setFormData(prev => ({
      ...prev,
      scalingGoals: [...prev.scalingGoals, ""]
    }));
  };

  const updateScalingGoal = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      scalingGoals: prev.scalingGoals.map((goal, i) => i === index ? value : goal)
    }));
  };

  const removeScalingGoal = (index: number) => {
    setFormData(prev => ({
      ...prev,
      scalingGoals: prev.scalingGoals.filter((_, i) => i !== index)
    }));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b border-border/50 backdrop-blur-sm bg-background/80 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
                  <Rocket className="h-5 w-5 text-background" />
                </div>
                <span className="text-xl font-bold tracking-tight">ScaleAdvisor</span>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="mb-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-6 w-6 text-primary" />
            <h1 className="text-4xl font-bold tracking-tight">Create New Project</h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Tell us about your project and we'll create a personalized scaling roadmap
          </p>
        </motion.div>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="glass">
            <CardHeader>
              <CardTitle>Project Details</CardTitle>
              <CardDescription>
                Provide information about your current setup and scaling goals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Basic Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="name">Project Name *</Label>
                    <Input
                      id="name"
                      placeholder="My Awesome App"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="techStack">Tech Stack *</Label>
                    <Select 
                      value={formData.techStack} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, techStack: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select your tech stack" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mern">MERN (MongoDB, Express, React, Node.js)</SelectItem>
                        <SelectItem value="nextjs">Next.js</SelectItem>
                        <SelectItem value="django">Django (Python)</SelectItem>
                        <SelectItem value="flask">Flask (Python)</SelectItem>
                        <SelectItem value="laravel">Laravel (PHP)</SelectItem>
                        <SelectItem value="rails">Ruby on Rails</SelectItem>
                        <SelectItem value="spring">Spring Boot (Java)</SelectItem>
                        <SelectItem value="dotnet">.NET (C#)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of your project..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                {/* Scaling Phases */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="currentPhase">Current Phase *</Label>
                    <Select 
                      value={formData.currentPhase} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, currentPhase: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Where are you now?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="startup">
                          <div className="flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-primary" />
                            <span>Startup (MVP, basic deployment)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="growth">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span>Growth (Some traffic, basic scaling)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="scale">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-primary" />
                            <span>Scale (High traffic, performance focus)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="enterprise">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span>Enterprise (Complex infrastructure)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="targetPhase">Target Phase *</Label>
                    <Select 
                      value={formData.targetPhase} 
                      onValueChange={(value) => setFormData(prev => ({ ...prev, targetPhase: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Where do you want to be?" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="startup">
                          <div className="flex items-center gap-2">
                            <Rocket className="h-4 w-4 text-primary" />
                            <span>Startup (MVP, basic deployment)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="growth">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="h-4 w-4 text-primary" />
                            <span>Growth (Some traffic, basic scaling)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="scale">
                          <div className="flex items-center gap-2">
                            <Zap className="h-4 w-4 text-primary" />
                            <span>Scale (High traffic, performance focus)</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="enterprise">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span>Enterprise (Complex infrastructure)</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Current Infrastructure */}
                <div className="space-y-2">
                  <Label htmlFor="currentInfra">Current Infrastructure</Label>
                  <Textarea
                    id="currentInfra"
                    placeholder="Describe your current setup (e.g., 'Single EC2 instance with PostgreSQL', 'Heroku with Redis addon', etc.)"
                    value={formData.currentInfra}
                    onChange={(e) => setFormData(prev => ({ ...prev, currentInfra: e.target.value }))}
                    rows={3}
                  />
                </div>

                {/* Scaling Goals */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>Scaling Goals</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addScalingGoal}>
                      Add Goal
                    </Button>
                  </div>
                  
                  {formData.scalingGoals.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Add specific goals like "Handle 10k concurrent users", "Reduce response time to &lt;200ms", etc.
                    </p>
                  )}
                  
                  {formData.scalingGoals.map((goal, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        placeholder="e.g., Handle 10k concurrent users"
                        value={goal}
                        onChange={(e) => updateScalingGoal(index, e.target.value)}
                      />
                      <Button 
                        type="button" 
                        variant="outline" 
                        size="sm"
                        onClick={() => removeScalingGoal(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-6">
                  <Button 
                    type="submit" 
                    size="lg" 
                    disabled={isLoading}
                    className="glow-primary"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Creating Project...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Create Project & Generate Roadmap
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}