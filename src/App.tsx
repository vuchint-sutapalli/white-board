import React from "react";
import CanvasWhiteboard from "./CanvasWhiteboard";
// import FabricWhiteboard from "./CanvasWhiteboard/FabricWhiteboard";

// import KonvaTestBoard from "./Konva.tsx";

const App: React.FC = () => {
	return (
		<div style={{ padding: "20px" }}>
			{/* <h1>Fabric.js Whiteboard</h1>
			<FabricWhiteboard /> */}
			<h1>Original Whiteboard</h1>
			<CanvasWhiteboard />
			{/* <KonvaTestBoard /> */}
		</div>
	);
};

export default App;
