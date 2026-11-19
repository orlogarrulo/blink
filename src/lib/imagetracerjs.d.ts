declare module "imagetracerjs" {
  export type TraceColor = { r: number; g: number; b: number; a: number };

  export type TraceOptions = {
    ltres?: number;
    qtres?: number;
    pathomit?: number;
    rightangleenhance?: boolean;
    colorsampling?: number;
    numberofcolors?: number;
    mincolorratio?: number;
    colorquantcycles?: number;
    layering?: number;
    strokewidth?: number;
    linefilter?: boolean;
    scale?: number;
    roundcoords?: number;
    viewbox?: boolean;
    desc?: boolean;
    blurradius?: number;
    blurdelta?: number;
    pal?: TraceColor[];
  };

  export type TracePath = { isholepath?: boolean; segments?: unknown[] };

  export type TraceData = {
    layers: TracePath[][];
    palette: TraceColor[];
    width: number;
    height: number;
  };

  export type ImageTracerApi = {
    imagedataToTracedata(image: ImageData, options?: TraceOptions): TraceData;
    getsvgstring(data: TraceData, options?: TraceOptions): string;
  };

  const api: ImageTracerApi;
  export default api;
}
