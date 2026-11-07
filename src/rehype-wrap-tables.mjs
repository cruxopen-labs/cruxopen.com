// Wrap every <table> from Markdown in <div class="table-wrap"> so wide tables
// scroll sideways on a phone instead of pushing the page wider.
export default function rehypeWrapTables() {
  return (tree) => {
    const walk = (node) => {
      if (!node.children) return;
      node.children = node.children.map((child) => {
        walk(child);
        if (child.type === "element" && child.tagName === "table") {
          return { type: "element", tagName: "div", properties: { className: ["table-wrap"] }, children: [child] };
        }
        return child;
      });
    };
    walk(tree);
  };
}
