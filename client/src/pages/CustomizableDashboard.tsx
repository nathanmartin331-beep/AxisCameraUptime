import { useState } from "react";
import { Responsive, WidthProvider, Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Plus, Settings } from "lucide-react";
import { WidgetRenderer } from "@/components/widgets/WidgetRenderer";
import { DEFAULT_LAYOUT, WIDGET_CATALOG, createWidgetInstance } from "@/components/widgets/WidgetCatalog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface WidgetInstance {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export default function CustomizableDashboard() {
  const [isAddWidgetOpen, setIsAddWidgetOpen] = useState(false);

  // Load layout from backend
  const { data: savedLayout } = useQuery({
    queryKey: ['/api/dashboard/layout'],
  });

  const [widgets, setWidgets] = useState<WidgetInstance[]>(
    (savedLayout as any)?.widgets || DEFAULT_LAYOUT
  );

  // Save layout mutation
  const saveLayoutMutation = useMutation({
    mutationFn: async (layout: WidgetInstance[]) => {
      const response = await fetch('/api/dashboard/layout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ widgets: layout }),
      });
      if (!response.ok) throw new Error('Failed to save layout');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/layout'] });
    },
  });

  const handleLayoutChange = (newLayout: Layout[]) => {
    // Update widget positions based on react-grid-layout changes
    const updatedWidgets = widgets.map((widget) => {
      const layoutItem = newLayout.find((item) => item.i === widget.id);
      if (layoutItem) {
        return {
          ...widget,
          x: layoutItem.x,
          y: layoutItem.y,
          w: layoutItem.w,
          h: layoutItem.h,
        };
      }
      return widget;
    });

    setWidgets(updatedWidgets);
    saveLayoutMutation.mutate(updatedWidgets);
  };

  const handleAddWidget = (widgetType: string) => {
    const newWidget = createWidgetInstance(widgetType, { 
      x: 0, 
      y: Infinity, // Add at bottom
      w: WIDGET_CATALOG.find(w => w.type === widgetType)?.defaultSize.w || 3,
      h: WIDGET_CATALOG.find(w => w.type === widgetType)?.defaultSize.h || 2,
    });
    
    const updatedWidgets = [...widgets, newWidget];
    setWidgets(updatedWidgets);
    saveLayoutMutation.mutate(updatedWidgets);
    setIsAddWidgetOpen(false);
  };

  const handleRemoveWidget = (widgetId: string) => {
    const updatedWidgets = widgets.filter((w) => w.id !== widgetId);
    setWidgets(updatedWidgets);
    saveLayoutMutation.mutate(updatedWidgets);
  };

  // Convert widgets to react-grid-layout format
  const layout = widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: WIDGET_CATALOG.find(w => w.type === widget.type)?.minSize?.w || 2,
    minH: WIDGET_CATALOG.find(w => w.type === widget.type)?.minSize?.h || 2,
  }));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="title-dashboard">Customizable Dashboard</h1>
          <p className="text-muted-foreground">Drag widgets to rearrange, resize as needed</p>
        </div>
        
        <Dialog open={isAddWidgetOpen} onOpenChange={setIsAddWidgetOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-add-widget">
              <Plus className="h-4 w-4 mr-2" />
              Add Widget
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle data-testid="title-widget-catalog">Widget Catalog</DialogTitle>
              <DialogDescription>
                Choose a widget to add to your dashboard
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
              {WIDGET_CATALOG.map((widget) => (
                <Card 
                  key={widget.id} 
                  className="hover-elevate active-elevate-2 cursor-pointer"
                  onClick={() => handleAddWidget(widget.type)}
                  data-testid={`widget-option-${widget.type}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <h3 className="font-semibold text-sm mb-1">{widget.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          {widget.description}
                        </p>
                        <div className="mt-2">
                          <span className="text-xs bg-muted px-2 py-1 rounded">
                            {widget.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ResponsiveGridLayout
        className="layout"
        layouts={{ lg: layout }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={80}
        onLayoutChange={handleLayoutChange}
        isDraggable={true}
        isResizable={true}
        margin={[16, 16]}
        containerPadding={[0, 0]}
      >
        {widgets.map((widget) => (
          <div key={widget.id} className="relative" data-testid={`widget-${widget.id}`}>
            <div className="h-full w-full">
              <WidgetRenderer type={widget.type} config={widget} />
            </div>
            
            {/* Remove button (visible on hover) */}
            <Button
              size="icon"
              variant="destructive"
              className="absolute top-2 right-2 h-6 w-6 opacity-0 hover:opacity-100 transition-opacity z-10"
              onClick={(e) => {
                e.stopPropagation();
                handleRemoveWidget(widget.id);
              }}
              data-testid={`button-remove-${widget.id}`}
            >
              ×
            </Button>
          </div>
        ))}
      </ResponsiveGridLayout>

      {widgets.length === 0 && (
        <div className="text-center py-12">
          <Settings className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No Widgets Added</h3>
          <p className="text-muted-foreground mb-4">
            Get started by adding widgets from the catalog
          </p>
          <Button onClick={() => setIsAddWidgetOpen(true)} data-testid="button-add-first-widget">
            <Plus className="h-4 w-4 mr-2" />
            Add Your First Widget
          </Button>
        </div>
      )}
    </div>
  );
}
