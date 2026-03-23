import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Patch to prevent "removeChild" / "insertBefore" errors caused by
// browser extensions or auto-translate modifying the DOM outside React.
if (typeof Node !== 'undefined') {
  const origRemoveChild = Node.prototype.removeChild;
  // @ts-ignore
  Node.prototype.removeChild = function <T extends Node>(child: T): T {
    if (child.parentNode !== this) {
      console.warn('[DOM patch] removeChild: node is not a child', child);
      return child;
    }
    // @ts-ignore
    return origRemoveChild.call(this, child) as T;
  };

  const origInsertBefore = Node.prototype.insertBefore;
  // @ts-ignore
  Node.prototype.insertBefore = function <T extends Node>(newNode: T, refNode: Node | null): T {
    if (refNode && refNode.parentNode !== this) {
      console.warn('[DOM patch] insertBefore: ref node is not a child', refNode);
      return newNode;
    }
    // @ts-ignore
    return origInsertBefore.call(this, newNode, refNode) as T;
  };
}

createRoot(document.getElementById("root")!).render(<App />);
