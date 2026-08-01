import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@/test-utils/render";
import { EndpointSettings } from "./endpoint-settings";

const endpoint = {
  id: 1,
  name: "Main Cluster",
  apiUrl: "https://192.168.1.10:8006",
  apiToken: "••••abcd",
  verifyTls: false,
  enabled: true,
  order: 0,
};

afterEach(cleanup);

describe("EndpointSettings", () => {
  test("opens the create form when adding a second server", () => {
    render(
      <EndpointSettings
        endpoints={[endpoint]}
        onClose={mock()}
        onSaved={mock()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add Server" }));

    expect(screen.getByRole("heading", { name: "Add Proxmox Server" })).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("API URL")).toBeInTheDocument();
    expect(screen.getByLabelText("API Token")).toBeInTheDocument();
  });

  test("gives each existing endpoint an accessible edit action", () => {
    render(
      <EndpointSettings
        endpoints={[endpoint]}
        onClose={mock()}
        onSaved={mock()}
      />,
    );

    expect(screen.getByRole("button", { name: "Edit Main Cluster" })).toBeInTheDocument();
  });
});
