import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type NodeType = "db" | "lb" | "api";

type CanvasNode = {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  // optional extensible props
  props?: {
    engine?: string; // e.g. "postgres"
    replicas?: number; // for API
  };
};

export function InfraCanvas({
  projectId,
  onGenerated,
}: {
  projectId: string;
  onGenerated?: () => void;
}) {
  const generateFromCanvas = useMutation(api.configurations.generateFromCanvas);

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const addNode = (type: NodeType) => {
    const id = `${type}-${Math.random().toString(36).slice(2, 8)}`;
    const defaultProps =
      type === "db"
        ? { engine: "postgres" }
        : type === "api"
        ? { replicas: 2 }
        : undefined;
    setNodes((prev) => [
      ...prev,
      {
        id,
        type,
        x: 40 + prev.length * 24,
        y: 40 + prev.length * 24,
        props: defaultProps,
      },
    ]);
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setNodes((prev) => prev.filter((n) => n.id !== selectedId));
    setSelectedId(null);
  };

  const onMouseDownNode = (
    e: React.MouseEvent<HTMLDivElement>,
    id: string
  ) => {
    e.stopPropagation();
    const rect = (e.currentTarget.parentElement as HTMLDivElement)?.getBoundingClientRect();
    const node = nodes.find((n) => n.id === id);
    if (!rect || !node) return;
    setSelectedId(id);
    setDraggingId(id);
    dragOffset.current = {
      x: e.clientX - (rect.left + node.x),
      y: e.clientY - (rect.top + node.y),
    };
  };

  const canvasRef = useRef<HTMLDivElement>(null);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const nextX = e.clientX - rect.left - dragOffset.current.x;
    const nextY = e.clientY - rect.top - dragOffset.current.y;

    setNodes((prev) =>
      prev.map((n) =>
        n.id === draggingId
          ? {
              ...n,
              x: Math.max(0, Math.min(nextX, rect.width - 120)),
              y: Math.max(0, Math.min(nextY, rect.height - 60)),
            }
          : n
      )
    );
  };

  const onMouseUp = () => {
    setDraggingId(null);
  };

  const iconForType = (type: NodeType) => {
    if (type === "db") return "🗄️";
    if (type === "lb") return "⚖️";
    return "🖥️";
  };

  const labelForType = (type: NodeType) => {
    if (type === "db") return "Database";
    if (type === "lb") return "Load Balancer";
    return "API Server";
  };

  const handleGenerate = async () => {
    if (nodes.length === 0) {
      toast.info("Add some nodes to the canvas first.");
      return;
    }
    try {
      toast("Generating Terraform and Kubernetes from canvas...");
      await generateFromCanvas({
        projectId: projectId as any,
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type,
          x: n.x,
          y: n.y,
          props: n.props ?? {},
        })) as any,
      });
      toast.success("Configs generated and saved to the project");
      onGenerated?.();
    } catch (e) {
      console.error("generateFromCanvas error", e);
      toast.error("Failed to generate from canvas");
    }
  };

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  const updateSelectedProps = (updates: Partial<CanvasNode["props"]>) => {
    if (!selectedId) return;
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedId ? { ...n, props: { ...(n.props ?? {}), ...updates } } : n
      )
    );
  };

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Canvas</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => addNode("db")}>
              Add DB
            </Button>
            <Button variant="outline" onClick={() => addNode("lb")}>
              Add LB
            </Button>
            <Button variant="outline" onClick={() => addNode("api")}>
              Add API
            </Button>
            <Button onClick={handleGenerate} className="glow-primary">
              Generate
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div
            ref={canvasRef}
            className="relative h-[360px] rounded-md border bg-gradient-to-br from-background to-muted/40 overflow-hidden"
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            onMouseDown={() => setSelectedId(null)}
          >
            {/* background grid */}
            <div className="absolute inset-0 pointer-events-none [background-image:linear-gradient(to_right,theme(colors.border)_1px,transparent_1px),linear-gradient(to_bottom,theme(colors.border)_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
            {nodes.map((n) => (
              <div
                key={n.id}
                className={`absolute w-28 select-none cursor-move rounded-lg border shadow-sm ${
                  selectedId === n.id
                    ? "ring-2 ring-primary bg-primary/10"
                    : "bg-card/80"
                }`}
                style={{ left: n.x, top: n.y }}
                onMouseDown={(e) => onMouseDownNode(e, n.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedId(n.id);
                }}
              >
                <div className="p-2 text-sm font-medium flex items-center gap-2">
                  <span>{iconForType(n.type)}</span>
                  <span>{labelForType(n.type)}</span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          Tip: Drag nodes around. Select a node to edit properties.
        </div>
        <div className="flex gap-2">
          <Button variant="destructive" onClick={removeSelected} disabled={!selectedId}>
            Remove Selected
          </Button>
        </div>
      </div>

      {selectedNode && (
        <Card className="glass">
          <CardHeader>
            <CardTitle>Edit Node</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-muted-foreground">ID</div>
                <div className="font-mono">{selectedNode.id}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Type</div>
                <div className="capitalize">{selectedNode.type}</div>
              </div>
            </div>

            {selectedNode.type === "db" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground mb-1">Engine</div>
                  <select
                    className="w-full bg-background border rounded px-2 py-1"
                    value={selectedNode.props?.engine ?? "postgres"}
                    onChange={(e) => updateSelectedProps({ engine: e.target.value })}
                  >
                    <option value="postgres">Postgres</option>
                    <option value="mysql">MySQL</option>
                  </select>
                </div>
              </div>
            )}

            {selectedNode.type === "api" && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-muted-foreground mb-1">Replicas</div>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    className="w-full bg-background border rounded px-2 py-1"
                    value={selectedNode.props?.replicas ?? 2}
                    onChange={(e) =>
                      updateSelectedProps({ replicas: Math.max(1, Math.min(10, Number(e.target.value) || 1)) })
                    }
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default InfraCanvas;
