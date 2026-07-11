import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { Roles } from "../Roles";

jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");
  return { ...actual, addToast: jest.fn() };
});

jest.mock("next-intl", () => {
  const roleTranslations = (key) => key;
  return { useTranslations: () => roleTranslations };
});

jest.mock("@/hooks/usePermission", () => ({
  RequirePermission: ({ children }) => children,
}));

jest.mock("@/providers/configurations/configurationsProvider", () => ({
  useConfigurations: () => ({ businessType: "store" }),
}));

jest.mock("@/components/pages/Store/hooks/usePermissions", () => ({
  usePermissions: () => ({ permissions: [], loading: false }),
}));

jest.mock("../RolesList", () => ({
  RolesList: () => <div>roles list</div>,
}));

jest.mock("../CreateRoleModal", () => ({
  CreateRoleModal: ({ isOpen, onSubmit, form, setForm, creating }) => (
    isOpen ? (
      <div>
        <span>roles.create.title</span>
        <span data-testid="creating">{creating ? "yes" : "no"}</span>
        <span data-testid="role-name">{form.name}</span>
        <button type="button" onClick={() => setForm((currentForm) => ({ ...currentForm, name: "cashier" }))}>
          set role name
        </button>
        <button type="button" onClick={onSubmit}>
          roles.actions.create
        </button>
      </div>
    ) : null
  ),
}));

jest.mock("../DeleteRoleModal", () => ({
  DeleteRoleModal: () => null,
}));

jest.mock("../EditRoleModal", () => ({
  EditRoleModal: () => null,
}));

const { addToast } = require("@heroui/react");

const renderRoles = (props = {}) => render(
  <Roles
    roles={[]}
    createRole={jest.fn()}
    deleteRole={jest.fn()}
    loading={false}
    updateRoleWithPermissions={jest.fn()}
    getRolePermissions={jest.fn()}
    {...props}
  />,
);

describe("Roles", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows a success toast after creating a role", async () => {
    const createRole = jest.fn(() => Promise.resolve("role-id"));

    renderRoles({ createRole });

    fireEvent.click(screen.getByText("roles.actions.new"));
    fireEvent.click(screen.getByText("set role name"));

    await waitFor(() => expect(screen.getByTestId("role-name")).toHaveTextContent("cashier"));

    fireEvent.click(screen.getByText("roles.actions.create"));

    await waitFor(() => expect(createRole).toHaveBeenCalledWith({
      name: "cashier",
      password: undefined,
      isAdmin: false,
      permissions: [],
    }));
    expect(addToast).toHaveBeenCalledWith({
      title: "roles.actions.createSuccess",
      color: "success",
    });
    expect(screen.queryByText("roles.create.title")).not.toBeInTheDocument();
  });

  it("shows an error toast and keeps the create modal open when role creation fails", async () => {
    const createRole = jest.fn(() => Promise.reject(new Error("create failed")));

    renderRoles({ createRole });

    fireEvent.click(screen.getByText("roles.actions.new"));
    fireEvent.click(screen.getByText("set role name"));

    await waitFor(() => expect(screen.getByTestId("role-name")).toHaveTextContent("cashier"));

    fireEvent.click(screen.getByText("roles.actions.create"));

    await waitFor(() => expect(createRole).toHaveBeenCalledWith({
      name: "cashier",
      password: undefined,
      isAdmin: false,
      permissions: [],
    }));
    expect(addToast).toHaveBeenCalledWith({
      title: "roles.actions.createErrorTitle",
      description: "roles.actions.createErrorDescription",
      color: "danger",
    });
    expect(screen.getByText("roles.create.title")).toBeInTheDocument();
  });
});
