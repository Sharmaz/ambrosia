import { render, screen, fireEvent } from "@testing-library/react";

import { RestartRequiredModal } from "../RestartRequiredModal";

jest.mock("@heroui/react", () => ({
  Modal: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
  ModalContent: ({ children }) => <div>{children}</div>,
  ModalHeader: ({ children }) => <div>{children}</div>,
  ModalBody: ({ children }) => <div>{children}</div>,
  ModalFooter: ({ children }) => <div>{children}</div>,
  Button: ({ onPress, children, ...props }) => (
    <button type="button" onClick={onPress} {...props}>{children}</button>
  ),
}));

describe("RestartRequiredModal", () => {
  it("renders nothing when closed", () => {
    render(<RestartRequiredModal isOpen={false} onAcknowledge={jest.fn()} />);
    expect(screen.queryByText("title")).not.toBeInTheDocument();
  });

  it("renders the title, description, and acknowledge button when open", () => {
    render(<RestartRequiredModal isOpen onAcknowledge={jest.fn()} />);
    expect(screen.getByText("title")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
    expect(screen.getByText("acknowledgeButton")).toBeInTheDocument();
  });

  it("calls onAcknowledge when the acknowledge button is pressed", () => {
    const onAcknowledge = jest.fn();
    render(<RestartRequiredModal isOpen onAcknowledge={onAcknowledge} />);
    fireEvent.click(screen.getByText("acknowledgeButton"));
    expect(onAcknowledge).toHaveBeenCalledTimes(1);
  });
});
