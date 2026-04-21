import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";
import { viteStaticCopy }from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    solidPlugin(),
		viteStaticCopy({
			structured: false,
			targets: [
                {
					src: "node_modules/@titaniumnetwork-dev/ultraviolet/dist/*",
					dest: "active",
				},
				{
					src: "node_modules/@mercuryworkshop/scramjet/dist/*",
					dest: "scramjet",
				},
			],
		}),
  ],
});
