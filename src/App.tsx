import React from "react";
import CanvasWhiteboard from "./CanvasWhiteboard/index";

// import KonvaTestBoard from "./Konva.tsx";

const App: React.FC = () => {
	return (
		<div style={{ padding: "20px" }}>
			<h1>Level 0 Hybrid Whiteboard</h1>
			<CanvasWhiteboard />
			{/* <KonvaTestBoard /> */}
		</div>
	);
};

export default App;
